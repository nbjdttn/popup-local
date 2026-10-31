import Anthropic from '@anthropic-ai/sdk';

import { findingKey, type FeedKind, type FeedResult, type Finding, type Settings } from './types';

/**
 * The search agent.
 *
 * Runs Claude with Anthropic's server-side web search tool. Claude searches the
 * web for current pop-ups or discounts in the user's city for one category,
 * then hands back its results through the `report_findings` tool so the app
 * gets clean, structured data instead of free text.
 *
 * Everything runs from the phone: the request goes straight from the device to
 * the Anthropic API using the user's own API key. There is no app server.
 */

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 6;
const MAX_FINDINGS = 10;

const REPORT_TOOL: Anthropic.Beta.BetaTool = {
  name: 'report_findings',
  description:
    'Hand the final list of findings back to the app. Call this exactly once, after searching, ' +
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
              description: 'Address, mall or neighbourhood. Empty string if online only.',
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
                'Where it was found, e.g. "Xiaohongshu", "Weibo", "Dianping", "WeChat", "Instagram", "Time Out", "Brand site".',
            },
            interesting: {
              type: 'boolean',
              description:
                'True only for stand-out items worth a phone notification: new store openings, limited drops or collabs, ' +
                'discounts of 30% or more, freebies, or anything with a short window. False for routine listings.',
            },
          },
        },
      },
    },
  },
};

/** Extra instructions so the agent also covers Chinese social media, where many pop-ups are posted first. */
function chineseSourcesBlock(category: string, where: string): string {
  return [
    'Also search Chinese-language sources, where many pop-ups and deals are posted first:',
    '- Xiaohongshu / RED (小红书, xiaohongshu.com), Weibo (微博), Dianping (大众点评), WeChat articles (mp.weixin.qq.com) and Douyin (抖音).',
    `- Write queries in Chinese using the Chinese name of ${where} and of the category "${category}", ` +
      'for example "<城市> 泡泡玛特 快闪", "<城市> 快闪店 11月", "<城市> 折扣 优惠 限时", or add site:xiaohongshu.com.',
    '- Run at least two Chinese-language searches as well as English ones.',
    '- Social posts can be out of date: only keep items whose dates you can confirm are current or upcoming.',
  ].join('\n');
}

function buildPrompt(kind: FeedKind, category: string, settings: Settings): string {
  const today = new Date().toISOString().slice(0, 10);
  const where = [settings.city, settings.region, settings.country].filter(Boolean).join(', ');
  const what =
    kind === 'popup'
      ? `new or upcoming pop-up shops, pop-up stores, launch events, limited-time stalls and brand activations`
      : `current discounts, promotions, sales, coupon codes, member deals and limited-time offers`;

  return [
    `Today is ${today}. I live in ${where}.`,
    `Find ${what} in the category "${category}" that I can visit or use in or near ${where}.`,
    category.toLowerCase().includes('pop mart')
      ? 'For Pop Mart, include new store openings, Robo Shop machines, blind-box or figure drops, and Pop Mart pop-up events.'
      : '',
    settings.chineseSources ? chineseSourcesBlock(category, where) : '',
    '',
    'Rules:',
    '- Search the web; prefer official brand pages, mall pages, local news and event listings.',
    '- Only include items that are running now or start within the next 30 days. Skip anything that has ended.',
    '- Every item needs a real source URL from your search results. Do not invent details; leave a field empty if unknown.',
    `- Return at most ${MAX_FINDINGS} items, most interesting first. Remove duplicates.`,
    settings.language === 'zh'
      ? '- Write title, summary, dates and offer in Simplified Chinese.'
      : '- Write title, summary, dates and offer in English. If the source is in Chinese, add the original Chinese title in brackets after the English title.',
    '- When you are done, call the report_findings tool once with the list.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function isReportCall(block: Anthropic.Beta.BetaContentBlock): block is Anthropic.Beta.BetaToolUseBlock {
  return block.type === 'tool_use' && block.name === REPORT_TOOL.name;
}

function cleanFindings(input: unknown): Finding[] {
  const list = (input as { findings?: unknown })?.findings;
  if (!Array.isArray(list)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const raw of list) {
    const f: Finding = {
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

export class AgentError extends Error {}

/** Search for one category in one feed. Takes roughly 30-90 seconds. */
export async function runSearch(
  kind: FeedKind,
  category: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<FeedResult> {
  if (!settings.apiKey) throw new AgentError('Add your Anthropic API key in Settings first.');
  if (!settings.city) throw new AgentError('Set your city in Settings first.');

  // The key is the user's own and is kept in the device keychain, so calling
  // the API directly from the app is intended here.
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

  const webSearch: Anthropic.Beta.BetaWebSearchTool20260209 = {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: settings.chineseSources ? 8 : 6,
    user_location: {
      type: 'approximate',
      city: settings.city,
      ...(settings.region ? { region: settings.region } : {}),
      ...(settings.country ? { country: settings.country.toUpperCase().slice(0, 2) } : {}),
    },
  };

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: buildPrompt(kind, category, settings) },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create(
        {
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          // If a safety classifier declines, let the API retry on its recommended model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          tools: [webSearch, REPORT_TOOL],
          messages,
        },
        { signal },
      );
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new AgentError('Your API key was rejected. Check it in Settings.');
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new AgentError('Rate limited by the API. Wait a minute and try again.');
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new AgentError('Could not reach the internet. Check your connection.');
      }
      throw err;
    }

    if (response.stop_reason === 'refusal') {
      throw new AgentError('The search was declined. Try a different category name.');
    }

    const report = response.content.find(isReportCall);
    if (report) {
      return {
        kind,
        category,
        city: settings.city,
        fetchedAt: new Date().toISOString(),
        findings: cleanFindings(report.input),
      };
    }

    // Keep the full assistant content so the server can continue its search.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue; // server-side search still running

    // Claude answered in prose instead of calling the tool: ask it to file the results.
    messages.push({
      role: 'user',
      content: 'Please call report_findings now with what you found (an empty list is fine).',
    });
  }

  throw new AgentError('The search took too long. Please try again.');
}
