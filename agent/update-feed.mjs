// Runs the agent for every tab x category and writes site/data/feed.json.
// Also writes notify.md listing stand-out new items, which the GitHub
// workflow turns into a GitHub issue (= a notification for repo watchers).
//
// Usage: ANTHROPIC_API_KEY=... node agent/update-feed.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import { findingKey, runSearch } from './agent.mjs';
import { CATEGORIES, CONCURRENCY, KINDS, PLACE } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED_PATH = join(ROOT, 'site', 'data', 'feed.json');
const NOTIFY_PATH = join(ROOT, 'notify.md');

async function loadPrevious() {
  if (!existsSync(FEED_PATH)) return null;
  try {
    return JSON.parse(await readFile(FEED_PATH, 'utf8'));
  } catch {
    return null;
  }
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

export async function updateFeed({ client, previous, now = new Date() }) {
  const runAt = now.toISOString();
  const jobs = KINDS.flatMap((kind) => CATEGORIES.map((category) => ({ kind, category })));

  const outcomes = await pool(jobs, CONCURRENCY, async ({ kind, category }) => {
    const label = `${kind}/${category.name}`;
    const started = Date.now();
    try {
      const findings = await runSearch(client, kind, category);
      console.log(`✓ ${label}: ${findings.length} items in ${Math.round((Date.now() - started) / 1000)}s`);
      return { kind, category, findings };
    } catch (err) {
      console.error(`✗ ${label}: ${err?.message ?? err}`);
      return { kind, category, error: String(err?.message ?? err) };
    }
  });

  const feed = {
    city: PLACE.city,
    updatedAt: runAt,
    categories: CATEGORIES,
    feeds: { popup: {}, deal: {} },
  };
  const notify = [];

  for (const { kind, category, findings, error } of outcomes) {
    const before = previous?.feeds?.[kind]?.[category.name];
    if (error) {
      // Keep the last good results so the page isn't emptied by one failed search.
      feed.feeds[kind][category.name] = { ...(before ?? { findings: [] }), error };
      continue;
    }
    const firstSeen = new Map((before?.findings ?? []).map((f) => [findingKey(f), f.firstSeen]));
    const items = findings.map((f) => ({ ...f, firstSeen: firstSeen.get(findingKey(f)) ?? runAt }));
    feed.feeds[kind][category.name] = { fetchedAt: runAt, findings: items };

    // Only notify about genuinely new items, and not on the very first run for this category.
    if (before) {
      for (const f of items) if (f.firstSeen === runAt && f.interesting) notify.push({ kind, category, f });
    }
  }

  const failed = outcomes.filter((o) => o.error).length;
  return { feed, notify, failed, total: outcomes.length };
}

export function notifyMarkdown(notify, pageUrl) {
  const lines = [];
  for (const kind of KINDS) {
    const items = notify.filter((n) => n.kind === kind);
    if (!items.length) continue;
    lines.push(`### ${kind === 'popup' ? '快闪活动' : '优惠折扣'}`, '');
    for (const { category, f } of items) {
      const extra = [f.offer, f.dates, f.location].filter(Boolean).join(' · ');
      lines.push(`- **${category.zh}** — [${f.title}](${f.url})${extra ? ` — ${extra}` : ''}`);
    }
    lines.push('');
  }
  if (pageUrl) lines.push(`查看全部：${pageUrl}`);
  return lines.join('\n');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }
  const client = new Anthropic();
  const previous = await loadPrevious();
  const { feed, notify, failed, total } = await updateFeed({ client, previous });

  if (failed === total) {
    console.error('Every search failed; leaving the feed unchanged.');
    process.exit(1);
  }

  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2) + '\n');
  console.log(`Wrote ${FEED_PATH} (${total - failed}/${total} searches ok).`);

  if (notify.length) {
    await writeFile(NOTIFY_PATH, notifyMarkdown(notify, process.env.PAGE_URL));
    console.log(`${notify.length} stand-out new item(s) written to notify.md.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
