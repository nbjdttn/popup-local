// 曼城快闪: reads data/feed.json (written by the GitHub Actions agent) and renders it.
// Everything from the feed is inserted with textContent, never as HTML.
// 收藏 (saved items) are kept in this browser's localStorage.

(function () {
  const TZ = 'Europe/London';
  const PINS = '__pins'; // the "❤️ 收藏" chip

  const state = { feed: null, kind: 'popup', category: null, starOnly: false };

  const $ = (id) => document.getElementById(id);
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode etc. */
      }
    },
  };

  // ---------- dates ----------

  /** YYYY-MM-DD in Manchester time. */
  function dayOf(dateLike) {
    return new Date(dateLike).toLocaleDateString('en-CA', { timeZone: TZ });
  }
  const today = () => dayOf(Date.now());
  const yesterday = () => dayOf(Date.now() - 24 * 60 * 60 * 1000);

  function dayLabel(day) {
    if (day === today()) return '今天';
    if (day === yesterday()) return '昨天';
    const [, m, d] = day.split('-').map(Number);
    return `${m}月${d}日`;
  }

  function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} 小时前`;
    return `${Math.round(hrs / 24)} 天前`;
  }

  // ---------- helpers ----------

  function host(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(url || '') ? url : '#';
  }

  const keyOf = (f) => `${String(f.title).trim().toLowerCase()}|${String(f.url).trim()}`;

  // ---------- 收藏 (pins) ----------

  function loadPins() {
    try {
      const list = JSON.parse(store.get('pins') || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  let pins = loadPins();
  const isPinned = (f) => pins.some((p) => p.key === keyOf(f));

  function togglePin(f, kind, category) {
    const key = keyOf(f);
    pins = isPinned(f)
      ? pins.filter((p) => p.key !== key)
      : [{ key, kind, category, item: f, pinnedAt: new Date().toISOString() }, ...pins];
    store.set('pins', JSON.stringify(pins));
    render();
  }

  /** Saved items for a tab (optionally one category), newest saved first, using the latest copy from the feed. */
  function pinsFor(kind, category) {
    return pins
      .filter((p) => p.kind === kind && (!category || p.category === category))
      .map((p) => {
        const fresh = (state.feed?.feeds?.[p.kind]?.[p.category]?.findings ?? []).find((f) => keyOf(f) === p.key);
        return { ...p, item: fresh ?? p.item };
      });
  }

  // ---------- categories ----------

  /** Categories shown on the current tab. */
  function categories() {
    const all = state.feed?.categories ?? [];
    return all.filter((c) => !c.kinds || c.kinds.includes(state.kind));
  }

  /** Keep the selected chip valid when switching to a tab that doesn't have it. */
  function fixCategory() {
    const names = [PINS, ...categories().map((c) => c.name)];
    if (!names.includes(state.category)) {
      const saved = store.get('category');
      state.category = names.includes(saved) && saved !== PINS ? saved : categories()[0]?.name ?? null;
    }
  }

  function itemsFor(kind, name) {
    let items = state.feed?.feeds?.[kind]?.[name]?.findings ?? [];
    if (state.starOnly) items = items.filter((f) => f.interesting);
    return items;
  }

  function chip(label, count, selected, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = `chip ${extraClass}`.trim();
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(selected));
    btn.append(label);
    if (count) {
      const span = document.createElement('span');
      span.className = 'count';
      span.textContent = ` · ${count}`;
      btn.append(span);
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderChips() {
    const box = $('chips');
    box.replaceChildren();
    box.append(
      chip(
        '❤️ 收藏',
        pinsFor(state.kind).length,
        state.category === PINS,
        () => {
          state.category = PINS;
          render();
        },
        'chip-pins',
      ),
    );
    for (const c of categories()) {
      box.append(
        chip(c.zh || c.name, itemsFor(state.kind, c.name).length, c.name === state.category, () => {
          state.category = c.name;
          store.set('category', c.name);
          render();
        }),
      );
    }
    const selected = box.querySelector('[aria-pressed="true"]');
    if (selected) {
      // Scroll only if the selected chip is out of view, so the ❤️ 收藏 chip stays visible.
      const left = selected.offsetLeft - box.offsetLeft;
      const right = left + selected.offsetWidth;
      if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, left - 16);
    }
  }

  // ---------- cards ----------

  function card(f, kind, category) {
    const node = $('card').content.firstElementChild.cloneNode(true);
    const set = (sel, text) => {
      const el = node.querySelector(sel);
      el.textContent = text || '';
      el.hidden = !text;
    };
    const ended = Boolean(f.ends && f.ends < today());
    const pinned = isPinned(f);

    node.classList.toggle('is-ended', ended);
    node.classList.toggle('is-pinned', pinned);
    node.querySelector('.new').hidden = !(f.firstSeen && dayOf(f.firstSeen) === today()) || ended;
    node.querySelector('.ended').hidden = !ended;
    node.querySelector('.star').hidden = !f.interesting;
    set('.brand', f.brand);
    set('.offer', f.offer);
    set('.summary', f.summary);
    set('.dates', f.dates && `🗓 ${f.dates}`);
    set('.where', f.location && `📍 ${f.location}`);

    const link = node.querySelector('.title-link');
    link.textContent = f.title;
    link.href = safeUrl(f.url);
    const source = node.querySelector('.source');
    source.textContent = [f.source, host(f.url)].filter(Boolean).join(' · ') + ' ↗';
    source.href = safeUrl(f.url);

    const pin = node.querySelector('.pin');
    pin.setAttribute('aria-pressed', String(pinned));
    pin.textContent = pinned ? '❤️ 已收藏' : '♡ 收藏';
    pin.addEventListener('click', () => togglePin(f, kind, category));
    return node;
  }

  function heading(text) {
    const h = document.createElement('h3');
    h.className = 'day';
    h.textContent = text;
    return h;
  }

  function empty(title, text) {
    const div = document.createElement('div');
    div.className = 'empty';
    const strong = document.createElement('strong');
    strong.textContent = title;
    div.append(strong, text || '');
    return div;
  }

  // ---------- list ----------

  function renderPinsList(list) {
    const saved = pinsFor(state.kind);
    if (!saved.length) {
      list.append(empty('还没有收藏', '点卡片右下角的 ♡ 收藏，它就会出现在这里，也会排在分类的最上面。'));
      return;
    }
    for (const p of saved) list.append(card(p.item, p.kind, p.category));
  }

  function renderList() {
    const list = $('list');
    list.replaceChildren();
    if (state.category === PINS) {
      renderPinsList(list);
      return;
    }
    if (!state.feed?.updatedAt) {
      list.append(empty('还没有内容', 'AI 助手还没有运行过，第一次更新后这里会显示结果。'));
      return;
    }
    const entry = state.feed.feeds?.[state.kind]?.[state.category];
    if (entry?.error) {
      const p = document.createElement('p');
      p.className = 'warn';
      p.textContent = '这个分类最近一次搜索失败了，下面显示的是之前的结果。';
      list.append(p);
    }

    // Saved items first, even if the agent no longer lists them.
    const saved = pinsFor(state.kind, state.category);
    if (saved.length) {
      list.append(heading('❤️ 已收藏'));
      for (const p of saved) list.append(card(p.item, p.kind, p.category));
    }

    // Then everything else, grouped by the day it was first found, newest day first.
    const rest = itemsFor(state.kind, state.category).filter((f) => !isPinned(f));
    if (!rest.length) {
      if (!saved.length) {
        list.append(
          empty(state.starOnly ? '这里暂时没有精选内容' : '暂时没有找到', 'AI 助手明天早上会再找一遍。'),
        );
      }
      return;
    }
    const byDay = new Map();
    for (const f of rest) {
      const day = f.firstSeen ? dayOf(f.firstSeen) : today();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(f);
    }
    for (const day of [...byDay.keys()].sort().reverse()) {
      list.append(heading(dayLabel(day)));
      const items = byDay.get(day).sort((a, b) => Number(b.interesting) - Number(a.interesting));
      for (const f of items) list.append(card(f, state.kind, state.category));
    }
  }

  function render() {
    document.body.dataset.kind = state.kind;
    fixCategory();
    for (const tab of document.querySelectorAll('.tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.kind === state.kind));
    }
    renderChips();
    renderList();
  }

  // ---------- loading ----------

  function load() {
    fetch('data/feed.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((feed) => {
        $('updated').textContent = feed.updatedAt ? `${timeAgo(feed.updatedAt)}更新` : '尚未更新';
        if (state.feed && state.feed.updatedAt === feed.updatedAt) return; // nothing new
        const first = !state.feed;
        state.feed = feed;
        if (first) state.category = store.get('category');
        render();
      })
      .catch(() => {
        if (state.feed) return; // keep showing what we have
        $('updated').textContent = '加载失败';
        $('list').replaceChildren(empty('加载失败', '请刷新页面再试。'));
      });
  }

  function init() {
    state.kind = store.get('kind') === 'deal' ? 'deal' : 'popup';
    state.starOnly = store.get('starOnly') === '1';
    $('starOnly').checked = state.starOnly;

    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        state.kind = tab.dataset.kind;
        store.set('kind', state.kind);
        render();
      });
    }
    $('starOnly').addEventListener('change', (e) => {
      state.starOnly = e.target.checked;
      store.set('starOnly', state.starOnly ? '1' : '0');
      render();
    });

    load();
    // When she comes back to a page left open (e.g. yesterday's Safari tab), fetch the latest results.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });

    render();
  }

  init();
})();
