// Offline test: runs the full update against a fake Anthropic API.
// Checks the request shape, pause_turn handling, merging with the previous
// feed (firstSeen), which items trigger a WeChat message, and the message itself.

import assert from 'node:assert/strict';

import Anthropic from '@anthropic-ai/sdk';

import { buildPrompt } from './agent.mjs';
import { CATEGORIES, KINDS } from './config.mjs';
import { notifyWeChat, searchJobs, updateFeed } from './update-feed.mjs';
import { buildMessage, clip, serverChanUrl } from './wechat.mjs';

const OLD = '2026-10-30T07:00:00.000Z';
const item = (title, interesting = false, source = 'Xiaohongshu') => ({
  title,
  brand: 'Pop Mart',
  summary: 's',
  location: 'Arndale',
  dates: '1-10 Nov',
  offer: '',
  url: `https://example.com/${encodeURIComponent(title)}`,
  source,
  interesting,
});

const requests = [];
let calls = 0;
const fakeFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ body, headers: new Headers(init.headers) });
  calls++;
  const prompt = body.messages[0].content;
  const isPopMartPopup = prompt.includes('(Pop Mart)') && prompt.includes('pop-up shops');
  let reply;
  if (isPopMartPopup && body.messages.length === 1) {
    // First turn: the server-side search loop pauses.
    reply = { stop_reason: 'pause_turn', content: [{ type: 'text', text: 'searching' }] };
  } else {
    const findings = isPopMartPopup
      ? [item('Labubu pop-up', true), item('Old news'), item('Robo Shop opening', true), item('Bad', true, 'x')]
      : [];
    if (isPopMartPopup) findings[3].url = 'not-a-url';
    reply = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'report_findings', input: { findings } }],
    };
  }
  return new Response(
    JSON.stringify({
      id: `msg_${calls}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      ...reply,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};

const client = new Anthropic({ apiKey: 'sk-test', fetch: fakeFetch, maxRetries: 0 });

// Previous feed already knew about "Old news" and "Labubu pop-up" (but not "Robo Shop opening").
const previous = {
  updatedAt: OLD,
  feeds: {
    popup: { 'Pop Mart': { fetchedAt: OLD, findings: [{ ...item('Old news'), firstSeen: OLD }, { ...item('Labubu pop-up', true), firstSeen: OLD }] } },
    deal: {},
  },
};

const now = new Date('2026-10-31T07:00:00.000Z');
const result = await updateFeed({ client, previous, now });
const { feed, notify, failed, total } = result;

// Request shape
const first = requests[0];
assert.equal(first.body.model, 'claude-opus-5-5');
assert.equal(first.body.fallbacks, 'default');
assert.equal(first.headers.get('anthropic-beta'), 'server-side-fallback-2026-07-01');
assert.deepEqual(first.body.thinking, { type: 'adaptive' });
assert.equal(first.body.tools[0].type, 'web_search_20260209');
assert.equal(first.body.tools[0].user_location.city, 'Manchester');
assert.equal(first.body.tools[1].type, 'web_fetch_20260209');
assert.equal(first.body.tools[2].name, 'report_findings');

// One search per tab x category, plus one extra turn for the paused search.
const expectedJobs = KINDS.reduce((n, k) => n + CATEGORIES.filter((c) => c.kinds.includes(k)).length, 0);
assert.equal(total, expectedJobs);
assert.equal(searchJobs().filter((j) => j.category.name === 'Supermarket finds').length, 1, 'supermarket: deals tab only');
assert.deepEqual(feed.categories.find((c) => c.name === 'Supermarket finds').kinds, ['deal']);
assert.equal(failed, 0);
assert.equal(calls, total + 1);

// Merge + new-item detection
const popMart = feed.feeds.popup['Pop Mart'].findings;
assert.equal(popMart.length, 3, 'item without a valid URL is dropped');
const byTitle = Object.fromEntries(popMart.map((f) => [f.title, f]));
assert.equal(byTitle['Old news'].firstSeen, OLD);
assert.equal(byTitle['Labubu pop-up'].firstSeen, OLD);
assert.equal(byTitle['Robo Shop opening'].firstSeen, now.toISOString());

// Only the new + interesting item notifies; categories with no earlier results don't.
assert.equal(result.welcome, false);
assert.deepEqual(notify.map((n) => n.f.title), ['Robo Shop opening']);

// WeChat (Server酱) message
const sent = [];
const fakeWeChat = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ code: 0, message: '', data: { errno: 0 } }), { status: 200 });
};
const PAGE = 'https://example.github.io/popup-local/';
assert.equal(
  await notifyWeChat({ ...result, sendkey: 'SCT123abc', pageUrl: PAGE, fetchImpl: fakeWeChat }),
  true,
);
assert.equal(sent[0].url, 'https://sctapi.ftqq.com/SCT123abc.send');
const msg = sent[0].body;
assert.ok(Array.from(msg.title).length <= 32, 'title fits Server酱 limit');
assert.match(msg.title, /^曼城今日精选1条：Robo Shop opening/);
assert.match(buildMessage([{ kind: 'deal', category: { zh: '奶茶咖啡' }, f: { title: '买一送一', url: 'https://x.y' } }]).title, /^曼城今日羊毛1条/);
assert.match(msg.desp, /\*\*🎪 快闪活动\*\*/);
assert.match(msg.desp, /\*\*泡泡玛特\*\* · \[Robo Shop opening\]\(https:\/\/example\.com/);
assert.equal(result.newOther, 0);
assert.doesNotMatch(msg.desp, /另外还有/);
await notifyWeChat({ ...result, newOther: 2, sendkey: 'SCT123abc', fetchImpl: fakeWeChat });
assert.match(sent[1].body.desp, /另外还有 2 条新内容/, 'other new items are counted');
assert.match(msg.desp, /打开曼城快闪看全部/);

// Nothing stand-out → no message
assert.equal(await notifyWeChat({ notify: [], newOther: 3, welcome: false, sendkey: 'x', fetchImpl: fakeWeChat }), false);

// Server酱³ keys use the per-user host
assert.equal(serverChanUrl('sctp12345tABCDEF'), 'https://12345.push.ft07.com/send/sctp12345tABCDEF.send');
assert.equal(clip('一二三四五六七八九十', 5), '一二三四…');

// Server酱 errors are reported
const failing = async () => new Response(JSON.stringify({ code: 40001, message: 'bad key' }), { status: 200 });
await assert.rejects(
  notifyWeChat({ notify, newOther: 0, welcome: false, sendkey: 'SCTbad', fetchImpl: failing }),
  /bad key/,
);

// First ever run: welcome message with every stand-out item
const firstRun = await updateFeed({ client, previous: null, now });
assert.equal(firstRun.welcome, true);
assert.deepEqual(firstRun.notify.map((n) => n.f.title).sort(), ['Labubu pop-up', 'Robo Shop opening']);
sent.length = 0;
await notifyWeChat({ ...firstRun, sendkey: 'SCT1', pageUrl: PAGE, fetchImpl: fakeWeChat });
assert.match(sent[0].body.title, /^曼城快闪已开通/);
const md = sent[0].body.desp;

// Prompt covers Manchester and Chinese sources
const prompt = buildPrompt('popup', CATEGORIES[0], now);
assert.match(prompt, /Manchester/);
assert.match(prompt, /小红书/);
assert.match(prompt, /曼城 泡泡玛特/);
assert.match(prompt, /曼城 今日羊毛/);
assert.match(prompt, /web_fetch/);
assert.match(buildPrompt('deal', CATEGORIES.find((c) => c.name === 'Supermarket finds'), now), /好物推荐/);
assert.match(prompt, /Simplified Chinese/);

console.log('PASS — request shape, pause_turn, merge, WeChat message, prompt');
console.log(`\nSample WeChat message (${msg.title}):\n${msg.desp}`);
console.log(`\nSample welcome message (${sent[0].body.title}):\n${md}`);
