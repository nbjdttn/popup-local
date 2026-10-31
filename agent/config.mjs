// What the agent searches for. Edit this file to change categories.

export const PLACE = {
  city: 'Manchester',
  region: 'England',
  country: 'GB',
  timezone: 'Europe/London',
  /** Used for Chinese-language searches. */
  chineseName: '曼彻斯特',
  /** Areas the agent should treat as "in Manchester". */
  areas:
    'Manchester city centre, Arndale, Trafford Centre, Northern Quarter, Chinatown, ' +
    'Spinningfields, Deansgate, Ancoats, Piccadilly, Oxford Road, Salford Quays and Greater Manchester',
};

/** Shown as chips on the page, in this order. `zh` is used in Chinese searches and labels. */
export const CATEGORIES = [
  { name: 'Pop Mart', zh: '泡泡玛特' },
  { name: 'Food', zh: '美食' },
  { name: 'Coffee & Desserts', zh: '咖啡甜品' },
  { name: 'Fashion', zh: '时尚服饰' },
  { name: 'Beauty', zh: '美妆' },
  { name: 'Toys & Collectibles', zh: '潮玩手办' },
];

export const KINDS = /** @type {const} */ (['popup', 'deal']);

export const MODEL = 'claude-opus-5-5';

/** How many searches run at once. */
export const CONCURRENCY = 3;
