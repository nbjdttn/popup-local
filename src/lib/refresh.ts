import { runSearch } from './agent';
import { loadFeed, saveFeed } from './storage';
import { findingKey, type FeedKind, type FeedResult, type Finding, type Settings } from './types';

export interface RefreshOutcome {
  result: FeedResult;
  /** Findings that were not in the previous saved result. */
  fresh: Finding[];
}

/**
 * Run the agent for one feed + category, compare with what was saved last
 * time, and save the new result with the new items marked.
 */
export async function refreshFeed(
  kind: FeedKind,
  category: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<RefreshOutcome> {
  const previous = await loadFeed(kind, category, settings.city);
  const result = await runSearch(kind, category, settings, signal);

  const seen = new Set((previous?.findings ?? []).map(findingKey));
  // On the very first search everything is new; don't badge all of it.
  const fresh = previous ? result.findings.filter((f) => !seen.has(findingKey(f))) : [];
  result.newKeys = fresh.map(findingKey);

  await saveFeed(result);
  return { result, fresh };
}
