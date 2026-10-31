import Anthropic from '@anthropic-ai/sdk';

import { MODEL, PLACE } from './config.mjs';

/**
 * The search agent for one tab + category.
 *
 * Claude uses Anthropic's server-side web search tool (the searching happens on
 * Anthropic's servers), then hands back its results through the
 * `report_findings` tool so we get clean structured data, not free text.
 */

const MAX_TURNS = 6;
const MAX_FINDINGS = 10;

const REPORT_TOOL = {
  name: 'report_findings',
  description:
    'Hand the final list of findings back. Call this exactly once, after searching, ' +
    'with every relevant item you verified. Use an empty list if nothing current was found.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['findings'],
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'brand',
            'summary',
            'location',
            'dates',
            'offer',
            'url',
            'source',
            'interesting',
          ],
          properties: {
            title: { type: 'string', description: 'Short headline for the pop-up or deal.' },
            brand: { type: 'string', description: 'Brand, shop or organiser.' },
            summary: { type: 'string', description: 'One or two sentences on what it is.' },
            location: {
              type: 'string',
              description: 'Address, venue or area in Manchester. Empty string if online only.',
            },
            dates: {
              type: 'string',
              description: 'When it runs, e.g. "1-15 Nov 2026" or "Ends 3 Nov". Empty if unknown.',
            },
            offer: {
              type: 'string',
              description: 'Discount wording, e.g. "20% off". Empty string for pop-ups with no deal.',
            },
            url: { type: 'string', description: 'Source page URL taken from the search results.' },
            source: {
              type: 'string',
              description:
                'Where it was found, e.g. "Xiaohongshu", "Weibo", "WeChat", "Dianping", "Instagram", ' +
                '"Manchester Evening News", "Brand site".',
            },
            interesting: {
              type: 'boolean',
              description:
                'True only for stand-out items worth a notification: new store openings, limited drops or ' +
                'collabs, discounts of 30% or more, freebies, or anything with a short window.',
            },
          },
        },
      },
    },
  },
};

/** @param {'popup'|'deal'} kind @param {{name: string, zh: string}} category */
export function buildPrompt(kind, category, today = new Date()) {
  const date = today.toISOString().slice(0, 10);
  const what =
    kind === 'popup'
      ? 'new or upcoming pop-up shops, pop-up stores, store openings, launch events, limited-time stalls and brand activations'
      : 'current discounts, promotions, sales, coupon codes, student and member deals, and limited-time offers';
  const zhWhat = kind === 'popup' ? '快闪 / 快闪店 / 新店开业' : '折扣 / 优惠 / 限时活动';

  return [
    `Today is ${date}. Find ${what} in the category "${category.name}" in Manchester, UK.`,
    `Manchester here means: ${PLACE.areas}.`,
    category.name === 'Pop Mart'
      ? 'For Pop Mart, include store openings, Robo Shop machines, blind-box or figure drops, restocks and Pop Mart pop-up events in Manchester.'
      : '',
    '',
    'Search in English and in Chinese. Many pop-ups and deals for the Chinese community are posted first on',
    'Xiaohongshu / RED (小红书), Weibo (微博), WeChat articles (mp.weixin.qq.com) and Dianping (大众点评).',
    `- Run at least two Chinese-language searches, e.g. "${PLACE.chineseName} ${category.zh} ${zhWhat}", or add site:xiaohongshu.com.`,
    '- You can only see posts that are public on the web; that is fine, use what you can find.',
    '- Social posts are often old: only keep items whose dates you can confirm are current or upcoming.',
    '',
    'Rules:',
    '- Only include things in Manchester that are running now or start within the next 30 days. Skip anything that has ended or is in another city.',
    '- Every item needs a real source URL from your search results. Do not invent details; leave a field empty if unknown.',
    `- Return at most ${MAX_FINDINGS} items, most interesting first. Remove duplicates.`,
    '- Write in English. If the source is Chinese, put the original Chinese title in brackets after the English title.',
    '- When you are done, call the report_findings tool once with the list.',
  ]
    .filter((line, i, all) => line !== '' || (all[i - 1] ?? '') !== '')
    .join('\n');
}

export function findingKey(f) {
  return `${String(f.title).trim().toLowerCase()}|${String(f.url).trim()}`;
}

export function cleanFindings(input) {
  const list = input?.findings;
  if (!Array.isArray(list)) return [];
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const f = {
      title: str(raw?.title),
      brand: str(raw?.brand),
      summary: str(raw?.summary),
      location: str(raw?.location),
      dates: str(raw?.dates),
      offer: str(raw?.offer),
      url: str(raw?.url),
      source: str(raw?.source),
      interesting: raw?.interesting === true,
    };
    if (!f.title || !/^https?:\/\//i.test(f.url)) continue;
    const key = findingKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.slice(0, MAX_FINDINGS);
}

/**
 * Run one search. Takes roughly 30-90 seconds.
 * @param {Anthropic} client
 * @param {'popup'|'deal'} kind
 * @param {{name: string, zh: string}} category
 */
export async function runSearch(client, kind, category) {
  const webSearch = {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 8,
    user_location: {
      type: 'approximate',
      city: PLACE.city,
      region: PLACE.region,
      country: PLACE.country,
      timezone: PLACE.timezone,
    },
  };

  const messages = [{ role: 'user', content: buildPrompt(kind, category) }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // If a safety classifier declines, let the API retry on its recommended model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: [webSearch, REPORT_TOOL],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The request was declined.');
    }

    const report = response.content.find(
      (b) => b.type === 'tool_use' && b.name === REPORT_TOOL.name,
    );
    if (report) return cleanFindings(report.input);

    // Keep the full assistant content so the server can continue its search.
    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason === 'pause_turn') continue;

    messages.push({
      role: 'user',
      content: 'Please call report_findings now with what you found (an empty list is fine).',
    });
  }
  throw new Error('Search did not finish in time.');
}
