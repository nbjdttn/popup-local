# Popup Local · Manchester

A web page that lists **new pop-ups** and **new deals in Manchester**. A Claude agent finds them by searching the web in English and Chinese. There's nothing to install: people just open the link.

- **Pop-ups 快闪**: pop-up shops, store openings, launch events and limited drops.
- **Deals 优惠**: discounts, sales, coupon codes, student and member offers.
- Both tabs share the same categories: Pop Mart, Food, Coffee & Desserts, Fashion, Beauty, Toys & Collectibles.
- **NEW** marks items found in the last 3 days. **★** marks stand-out items (new openings, limited drops, discounts of 30% or more, freebies). The **★ Stand-out** switch shows only those.

## How it works

```
GitHub Actions (twice a day)           GitHub Pages
┌──────────────────────────────┐       ┌──────────────────────┐
│ agent/update-feed.mjs         │       │ site/index.html      │
│  └ Claude + web search        │──────▶│  reads               │
│    (12 searches: 2 tabs ×     │ saves │  site/data/feed.json │
│     6 categories)             │       └──────────────────────┘
│  └ new ★ items → GitHub issue │──▶ notification to repo watchers
└──────────────────────────────┘
```

1. **The agent runs in GitHub Actions**, on GitHub's own machines, twice a day (around 7am and 5pm UK time). GitHub Pages only serves files, so the agent can't run on the page itself. Your Anthropic API key is kept as a repository secret and never reaches the page.
2. For each tab and category, Claude uses Anthropic's **web search** tool, set to Manchester, and reports structured results through a `report_findings` tool. It runs at least two **Chinese-language searches** each time (e.g. `曼彻斯特 泡泡玛特 快闪`, `site:xiaohongshu.com`) to pick up Xiaohongshu / RED, Weibo, WeChat and Dianping posts.
3. Results are saved to `site/data/feed.json` in the repo, and the page is republished.
4. **Notifications:** if a run finds new ★ items, the workflow opens a GitHub issue listing them. Anyone who **watches** the repo gets it as a GitHub notification (GitHub mobile app or email).

**Limits on Red Note (Xiaohongshu) coverage:** the agent can't log in to Xiaohongshu or read posts inside the app. It only finds posts that are public on the web and indexed by search engines, plus reposts on other sites. Each card shows its source, so check the original before you go.

## Setup (one time, in the GitHub website)

1. **Add your API key:** repo **Settings → Secrets and variables → Actions → New repository secret**. Name it `ANTHROPIC_API_KEY` and paste your key from console.anthropic.com.
2. **Turn on Pages:** **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Make this the default branch** (or merge it into `main`). Scheduled runs only happen on the default branch.
4. **First run:** **Actions → Update feed → Run workflow**. It takes about 5 minutes. The page will be at `https://nbjdttn.github.io/popup-local/`.
5. **Get notifications:** click **Watch → All Activity** on the repo (or **Custom → Issues**).

## Cost

Each run makes 12 Claude searches (Claude Opus 5.5, up to 8 web searches each). Web search costs $10 per 1,000 searches, plus tokens for reading the results. Expect roughly a few dollars per run. Check your usage in the Anthropic Console after the first run. To spend less, remove categories in `agent/config.mjs` or run once a day by editing the `cron` line in `.github/workflows/update-feed.yml`.

## Changing things

- **Categories / area:** `agent/config.mjs`
- **What the agent looks for:** `buildPrompt()` in `agent/agent.mjs`
- **Schedule:** `cron` in `.github/workflows/update-feed.yml`
- **Page design:** `site/`

## Files

```
site/index.html, app.js, style.css   the page (plain HTML/JS, no build step)
site/data/feed.json                  results, written by the agent
agent/config.mjs                     Manchester + categories
agent/agent.mjs                      the Claude + web search agent
agent/update-feed.mjs                runs all searches, merges, writes notify.md
agent/mock-test.mjs                  offline test with a fake API (npm test)
.github/workflows/update-feed.yml    schedule, save, notify, publish
```

To try it on your own computer (optional): `npm install`, then `npm test`. Run `ANTHROPIC_API_KEY=... npm run update` for a real search, and `npm run preview` to view the page at http://localhost:8000.
