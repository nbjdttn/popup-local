// Runs the agent for every tab x category and writes site/data/feed.json.
// Then sends a WeChat message (Server酱) listing stand-out new items.
//
// Usage: ANTHROPIC_API_KEY=... node agent/update-feed.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import { findingKey, manchesterDate, runSearch } from './agent.mjs';
import { CATEGORIES, CONCURRENCY, KINDS, PLACE } from './config.mjs';
import { buildMessage, sendWeChat } from './wechat.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED_PATH = join(ROOT, 'site', 'data', 'feed.json');

async function loadPrevious() {
  if (!existsSync(FEED_PATH)) return null;
  try {
    return JSON.parse(await readFile(FEED_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Every tab x category pair to search (some categories only appear on one tab). */
export function searchJobs() {
  return KINDS.flatMap((kind) =>
    CATEGORIES.filter((c) => (c.kinds ?? KINDS).includes(kind)).map((category) => ({ kind, category })),
  );
}

/** Run async jobs with at most `limit` in flight. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

/** Items not seen again are kept this long (unless their end date has passed). */
const KEEP_DAYS = 14;
const MAX_ITEMS_PER_CATEGORY = 40;

/** Still worth showing: not past its end date, and seen within KEEP_DAYS. */
export function stillOn(item, today, now) {
  if (item.ends && item.ends < today) return false;
  const seen = new Date(item.lastSeen ?? item.firstSeen ?? 0).getTime();
  return now.getTime() - seen <= KEEP_DAYS * 24 * 60 * 60 * 1000;
}

export async function updateFeed({ client, previous, now = new Date() }) {
  const runAt = now.toISOString();
  const today = manchesterDate(now);
  const jobs = searchJobs();
  const earlier = (kind, category) =>
    (previous?.feeds?.[kind]?.[category.name]?.findings ?? []).filter((f) => stillOn(f, today, now));

  const outcomes = await pool(jobs, CONCURRENCY, async ({ kind, category }) => {
    const label = `${kind}/${category.name}`;
    const started = Date.now();
    const tools = [];
    const onToolUse = (name, detail) => tools.push(`    ${name === 'web_fetch' ? 'open  ' : 'search'} ${detail}`);
    try {
      const known = earlier(kind, category).map(({ title, url }) => ({ title, url }));
      const findings = await runSearch(client, kind, category, { onToolUse, known });
      console.log(`✓ ${label}: ${findings.length} items in ${Math.round((Date.now() - started) / 1000)}s`);
      if (tools.length) console.log(tools.join('\n'));
      return { kind, category, findings };
    } catch (err) {
      console.error(`✗ ${label}: ${err?.message ?? err}`);
      if (tools.length) console.log(tools.join('\n'));
      return { kind, category, error: String(err?.message ?? err) };
    }
  });

  const feed = {
    city: PLACE.city,
    updatedAt: runAt,
    categories: CATEGORIES.map(({ name, zh, kinds }) => ({ name, zh, kinds: kinds ?? [...KINDS] })),
    feeds: { popup: {}, deal: {} },
  };
  // The very first run sends a welcome message with today's stand-out items.
  const welcome = !previous?.updatedAt;
  const notify = [];
  let newOther = 0;

  for (const { kind, category, findings, error } of outcomes) {
    const before = previous?.feeds?.[kind]?.[category.name];
    const kept = earlier(kind, category);
    if (error) {
      // Keep earlier results so the page isn't emptied by one failed search.
      feed.feeds[kind][category.name] = { ...(before ?? {}), findings: kept, error };
      continue;
    }
    // Today's finds (keeping the day each was first seen), then earlier items not found again today.
    const keptByKey = new Map(kept.map((f) => [findingKey(f), f]));
    const found = findings
      .filter((f) => !f.ends || f.ends >= today)
      .map((f) => ({ ...f, firstSeen: keptByKey.get(findingKey(f))?.firstSeen ?? runAt, lastSeen: runAt }));
    const foundKeys = new Set(found.map(findingKey));
    const carried = kept.filter((f) => !foundKeys.has(findingKey(f)));
    const items = [...found, ...carried].slice(0, MAX_ITEMS_PER_CATEGORY);
    feed.feeds[kind][category.name] = { fetchedAt: runAt, findings: items };

    for (const f of items) {
      if (welcome) {
        if (f.interesting) notify.push({ kind, category, f });
      } else if (before && f.firstSeen === runAt) {
        // Only genuinely new items; a newly added category doesn't flood the first day.
        if (f.interesting) notify.push({ kind, category, f });
        else newOther++;
      }
    }
  }

  const failed = outcomes.filter((o) => o.error).length;
  return { feed, notify, newOther, welcome, failed, total: outcomes.length };
}

/** Most messages fit in one WeChat card; the rest are counted. */
const MAX_IN_MESSAGE = 10;

export async function notifyWeChat({ notify, newOther, welcome, sendkey, pageUrl, fetchImpl }) {
  if (!notify.length) return false;
  const shown = notify.slice(0, MAX_IN_MESSAGE);
  const moreCount = newOther + (notify.length - shown.length);
  const msg = buildMessage(shown, { pageUrl, welcome, moreCount });
  await sendWeChat({ sendkey, ...msg, fetchImpl });
  return true;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }
  const client = new Anthropic();
  const previous = await loadPrevious();
  const result = await updateFeed({ client, previous });
  const { feed, notify, failed, total } = result;

  if (failed === total) {
    console.error('Every search failed; leaving the feed unchanged.');
    process.exit(1);
  }

  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2) + '\n');
  console.log(`Wrote ${FEED_PATH} (${total - failed}/${total} searches ok).`);
  console.log(`${notify.length} stand-out new item(s), ${result.newOther} other new item(s).`);

  const sendkey = process.env.SERVERCHAN_SENDKEY;
  if (!sendkey) {
    console.log('SERVERCHAN_SENDKEY not set; skipping WeChat.');
    return;
  }
  try {
    const sent = await notifyWeChat({ ...result, sendkey, pageUrl: process.env.PAGE_URL });
    console.log(sent ? 'WeChat message sent.' : 'Nothing stand-out and new; no WeChat message today.');
  } catch (err) {
    // Don't lose today's results because the message failed; flag it in the Actions log.
    console.log(`::warning::WeChat message failed: ${err.message ?? err}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
