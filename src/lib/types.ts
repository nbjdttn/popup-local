/** The two feeds the app shows, one per tab. */
export type FeedKind = 'popup' | 'deal';

/** One thing the agent found: a pop-up event or a discount. */
export interface Finding {
  title: string;
  /** Brand, shop or organiser, e.g. "Pop Mart". */
  brand: string;
  summary: string;
  /** Street address or area; empty for online-only deals. */
  location: string;
  /** Human-readable dates, e.g. "1–15 Nov 2026" or "Ends 3 Nov". */
  dates: string;
  /** Discount text such as "20% off" or "Buy 1 get 1"; empty for pop-ups. */
  offer: string;
  /** Link to the page the agent read this on. */
  url: string;
}

export interface FeedResult {
  kind: FeedKind;
  category: string;
  city: string;
  fetchedAt: string; // ISO timestamp
  findings: Finding[];
}

export interface Settings {
  apiKey: string;
  city: string;
  /** Two-letter country code, helps the web search pick local results. */
  country: string;
  categories: string[];
}

export const DEFAULT_CATEGORIES = [
  'Pop Mart',
  'Food',
  'Coffee & Desserts',
  'Fashion',
  'Beauty',
  'Toys & Collectibles',
];

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  city: '',
  country: '',
  categories: DEFAULT_CATEGORIES,
};
