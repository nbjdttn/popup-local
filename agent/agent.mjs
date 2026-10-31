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
            title: { type: 'string', description: 'Short headline in Simplified Chinese.' },
            brand: { type: 'string', description: 'Brand, shop or organiser, as Chinese readers know it, e.g. "泡泡玛特 Pop Mart".' },
            summary: { type: 'string', description: 'One or two sentences in Simplified Chinese.' },
            location: {
              type: 'string',
              description:
                'Venue or area in Manchester, in Chinese with the English name for navigation, e.g. "阿戴尔购物中心 Arndale". Empty string if online only.',
            },
            dates: {
              type: 'string',
              description: 'When it runs, in Chinese, e.g. "11月1日–15日" or "11月3日截止". Empty if unknown.',
            },
            offer: {
              type: 'string',
              description: 'Discount in Chinese, e.g. "八折" or "买一送一". Empty string for pop-ups with no deal.',
            },
            url: { type: 'string', description: 'Source page URL taken from the search results.' },
            source: {
              type: 'string',
              description:
                'Where it was found, in Chinese, e.g. "小红书", "微博", "微信公众号", "大众点评", "Instagram", ' +
                '"曼彻斯特晚报", "品牌官网".',
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

const KIND_WORDS = {
  popup: {
    en: 'new or upcoming pop-up shops, store openings, launch events, limited-time stalls and brand activations',
    zh: '快闪, 快闪店, 新店开业, 开业活动, 限定活动, 打卡',
  },
  deal: {
    en: 'freebies, current discounts, buy-one-get-one-free offers, coupon codes, student and member deals',
    zh: '羊毛, 今日羊毛, 免费, 🆓, 买一送一, BOGO, 折扣, 优惠, 学生折扣, 好物推荐',
  },
};

/** Real Xiaohongshu posts the user picked as examples of what she wants to see. */
const EXAMPLES = [
  '"曼城今日羊毛（10.31）泡泡玛特🆓礼物" - Pop Mart Manchester Halloween event: the first 100 people into the store could draw a free small gift.',
  '"曼城茶宴31号鸳鸯上新BOGO" - 茶宴 Chayan Manchester: buy one get one free on a new drink, Saturday 31 October only.',
  '"强力推荐这款LIDL 这款螯虾" - a Lidl product (Scottish langoustines) that people recommend as great value.',
];

/** Today's date in Manchester, as YYYY-MM-DD. */
function manchesterDate(now) {
  return now.toLocaleDateString('en-CA', { timeZone: PLACE.timezone });
}

/**
 * @param {'popup'|'deal'} kind
 * @param {{name: string, zh: string, hints?: string}} category
 */
export function buildPrompt(kind, category, now = new Date()) {
  const words = KIND_WORDS[kind];
  const [city] = PLACE.chineseNames;
  const firstHint = (category.hints ?? category.zh).split(',')[0].trim();

  return [
    `Today is ${manchesterDate(now)} in Manchester. You are helping a Chinese woman who lives in Manchester, UK.`,
    `Find ${words.en} in the category "${category.zh}" (${category.name}) in Manchester.`,
    `Manchester here means: ${PLACE.areas}.`,
    '',
    'The kind of posts she wants (real Xiaohongshu examples, shown for style only; do not return them unless they are still current):',
    ...EXAMPLES.map((e) => `- ${e}`),
    '',
    'Where and how to search:',
    '- Posts like these appear on Xiaohongshu, but Xiaohongshu notes almost never show up in web search results. Most of them repost',
    "  offers that started on a brand's own website or social accounts, a shopping centre's page, local media or a deal site. Search those",
    '  original sources first, mostly in English.',
    `- Where these offers usually start for this category: ${category.sources ?? 'brand websites and local Manchester media.'}`,
    '- Also check Manchester-wide sources for anything in this category: Manchester Evening News, Secret Manchester, Manchester’s Finest,',
    '  Confidentials, I Love Manchester, Visit Manchester, Manchester Arndale and Trafford Centre pages, Eventbrite and Allevents.',
    `- Then run one or two Chinese searches with the words people post with (${words.zh}), e.g. "${city} ${firstHint} ${words.zh.split(',')[0]}"`,
    `  or "${city} 今日羊毛". Chinese posts call the city ${PLACE.chineseNames.join(' or ')}. Use anything you find from Xiaohongshu (小红书), Weibo (微博),`,
    '  WeChat articles (微信公众号) or Dianping (大众点评), but do not spend more than two searches on Chinese sites.',
    `- Search words for this category: ${category.hints ?? category.zh}.`,
    '- Search snippets often leave out dates. Use web_fetch to open the most promising pages to check when the event or offer runs.',
    category.name === 'Supermarket finds'
      ? '- For supermarket finds, also include well-reviewed products worth buying (好物推荐) posted in the last two weeks, even without a discount.'
      : '',
    '',
    'Rules:',
    '- Only things she can use in Manchester: local events and shops, plus UK-wide offers from chains and supermarkets that have Manchester',
    '  branches. Skip things only available in other cities.',
    '- Only things that are on today or start within the next 30 days, or posts from the last 14 days about something still available. Skip anything that has ended, including one-day events before today.',
    '- Every item needs a real source URL from your searches. Do not invent details; leave a field empty if unknown.',
    `- Return at most ${MAX_FINDINGS} items, most useful first. Remove duplicates (the same offer posted by several people counts once).`,
    '- Mark interesting = true for free gifts, buy-one-get-one-free, 30% or more off, one-day or first-N-people events, limited drops and new openings.',
    '- Write every field in Simplified Chinese (简体中文), even when the source is in English. Keep brand names recognisable and',
    '  give English place names next to the Chinese so she can find them on a map.',
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
export async function runSearch(client, kind, category, { onToolUse = () => {} } = {}) {
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

  // Lets Claude open promising pages (e.g. public Xiaohongshu notes) to check dates and details.
  const webFetch = {
    type: 'web_fetch_20260209',
    name: 'web_fetch',
    max_uses: 5,
    max_content_tokens: 8000,
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
      tools: [webSearch, webFetch, REPORT_TOOL],
      messages,
    });

    for (const b of response.content) {
      if (b.type === 'server_tool_use') onToolUse(b.name, b.input?.query ?? b.input?.url ?? '');
    }

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
