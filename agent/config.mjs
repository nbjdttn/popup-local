// What the agent searches for. Edit this file to change categories.

export const PLACE = {
  city: 'Manchester',
  region: 'England',
  country: 'GB',
  timezone: 'Europe/London',
  /** Chinese posts usually say 曼城; 曼彻斯特 is the formal name. */
  chineseNames: ['曼城', '曼彻斯特'],
  /** Areas the agent should treat as "in Manchester". */
  areas:
    'Manchester city centre, Arndale, Trafford Centre, Northern Quarter, Chinatown, ' +
    'Spinningfields, Deansgate, Ancoats, Piccadilly, Oxford Road, Fallowfield, Salford Quays and Greater Manchester',
};

/**
 * Shown as chips on the page, in this order.
 * - name: internal key (stays the same even if the label changes)
 * - zh: label on the page and in notifications
 * - kinds: which tabs this category appears on
 * - hints: extra Chinese/English search words for the agent
 */
export const CATEGORIES = [
  {
    name: 'Pop Mart',
    zh: '泡泡玛特',
    kinds: ['popup', 'deal'],
    hints: '泡泡玛特, Pop Mart, Labubu, 盲盒, 抽奖, 限定, 免费礼物, Robo Shop',
  },
  {
    name: 'Food',
    zh: '美食',
    kinds: ['popup', 'deal'],
    hints: '探店, 新店开业, 餐厅, 火锅, 中餐, 试营业, 折扣, 免费试吃',
  },
  {
    name: 'Bubble tea & Coffee',
    zh: '奶茶咖啡',
    kinds: ['popup', 'deal'],
    hints: '奶茶, 茶宴 Chayan, 咖啡, 甜品, 新品, 上新, 买一送一, BOGO',
  },
  {
    name: 'Supermarket finds',
    zh: '超市好物',
    kinds: ['deal'],
    hints:
      'Lidl, Aldi, Tesco, Sainsbury’s, Asda, M&S, Co-op, 华人超市, 荣业行 Wing Yip, 好物推荐, 必买, 打折, 清仓',
  },
  {
    name: 'Beauty',
    zh: '美妆',
    kinds: ['popup', 'deal'],
    hints: '美妆, 护肤, Boots, Superdrug, 小样, 免费试用, 折扣码',
  },
  {
    name: 'Fashion',
    zh: '时尚服饰',
    kinds: ['popup', 'deal'],
    hints: '服饰, 包包, 打折, 闪购, sample sale, 学生折扣',
  },
  {
    name: 'Toys & Collectibles',
    zh: '潮玩手办',
    kinds: ['popup', 'deal'],
    hints: '潮玩, 手办, 盲盒, 谷子, 周边, 快闪, Miniso 名创优品, TOP TOY',
  },
];

export const KINDS = /** @type {const} */ (['popup', 'deal']);

export const MODEL = 'claude-opus-5-5';

/** How many searches run at once. */
export const CONCURRENCY = 3;
