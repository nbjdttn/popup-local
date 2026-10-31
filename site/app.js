// Popup Local: reads data/feed.json (written by the GitHub Actions agent) and renders it.
// Everything from the feed is inserted with textContent, never as HTML.

(function () {
  const NEW_FOR_MS = 3 * 24 * 60 * 60 * 1000; // items are marked 新 for 3 days

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

  function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} 小时前`;
    return `${Math.round(hrs / 24)} 天前`;
  }

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

  /** Categories shown on the current tab. */
  function categories() {
    const all = state.feed?.categories ?? [];
    return all.filter((c) => !c.kinds || c.kinds.includes(state.kind));
  }

  /** Keep the selected chip valid when switching to a tab that doesn't have it. */
  function fixCategory() {
    const names = categories().map((c) => c.name);
    if (!names.includes(state.category)) {
      const saved = store.get('category');
      state.category = names.includes(saved) ? saved : names[0] ?? null;
    }
  }

  function itemsFor(kind, name) {
    const entry = state.feed?.feeds?.[kind]?.[name];
    let items = entry?.findings ?? [];
    if (state.starOnly) items = items.filter((f) => f.interesting);
    return items;
  }

  function renderChips() {
    const box = $('chips');
    box.replaceChildren();
    for (const c of categories()) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(c.name === state.category));
      btn.append(c.zh || c.name);
      const n = itemsFor(state.kind, c.name).length;
      if (n) {
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = ` · ${n}`;
        btn.append(count);
      }
      btn.addEventListener('click', () => {
        state.category = c.name;
        store.set('category', c.name);
        render();
      });
      box.append(btn);
    }
    const selected = box.querySelector('[aria-pressed="true"]');
    if (selected) box.scrollLeft = Math.max(0, selected.offsetLeft - 16 - box.offsetLeft);
  }

  function card(f) {
    const node = $('card').content.firstElementChild.cloneNode(true);
    node.href = safeUrl(f.url);
    const set = (sel, text) => {
      const el = node.querySelector(sel);
      el.textContent = text || '';
      el.hidden = !text;
    };
    const isNew = f.firstSeen && Date.now() - new Date(f.firstSeen).getTime() < NEW_FOR_MS;
    node.querySelector('.new').hidden = !isNew;
    node.querySelector('.star').hidden = !f.interesting;
    set('.brand', f.brand);
    set('.offer', f.offer);
    set('.title', f.title);
    set('.summary', f.summary);
    set('.dates', f.dates && `🗓 ${f.dates}`);
    set('.where', f.location && `📍 ${f.location}`);
    set('.source', [f.source, host(f.url)].filter(Boolean).join(' · ') + ' ↗');
    return node;
  }

  function empty(title, text) {
    const div = document.createElement('div');
    div.className = 'empty';
    const strong = document.createElement('strong');
    strong.textContent = title;
    div.append(strong, text || '');
    return div;
  }

  function renderList() {
    const list = $('list');
    list.replaceChildren();
    if (!state.feed?.updatedAt) {
      list.append(
        empty('还没有内容', 'AI 助手还没有运行过，第一次更新后这里会显示结果。'),
      );
      return;
    }
    const entry = state.feed.feeds?.[state.kind]?.[state.category];
    if (entry?.error) {
      const p = document.createElement('p');
      p.className = 'warn';
      p.textContent = '这个分类最近一次搜索失败了，下面显示的是之前的结果。';
      list.append(p);
    }
    const items = itemsFor(state.kind, state.category);
    if (!items.length) {
      list.append(
        empty(
          state.starOnly ? '这里暂时没有精选内容' : '暂时没有找到',
          'AI 助手下次更新时会再找一遍。',
        ),
      );
      return;
    }
    // Newest first, then stand-out items.
    const sorted = [...items].sort(
      (a, b) =>
        (b.firstSeen || '').localeCompare(a.firstSeen || '') || Number(b.interesting) - Number(a.interesting),
    );
    for (const f of sorted) list.append(card(f));
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

    fetch('data/feed.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((feed) => {
        state.feed = feed;
        $('updated').textContent = feed.updatedAt ? `${timeAgo(feed.updatedAt)}更新` : '尚未更新';
        state.category = store.get('category');
        render();
      })
      .catch(() => {
        $('updated').textContent = '加载失败';
        $('list').replaceChildren(empty('加载失败', '请刷新页面再试。'));
      });

    render();
  }

  init();
})();
