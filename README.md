# Popup Local · Manchester

A web page, entirely in Chinese, that lists **new pop-ups** and **new deals in Manchester**. A Claude agent finds them every morning by searching the web in English and Chinese, and writes the results in Simplified Chinese. There's nothing to install: people just open the link.

- **快闪活动 (Pop-ups)**: pop-up shops, store openings, launch events and limited drops.
- **羊毛优惠 (Deals)**: 羊毛 freebies, buy-one-get-one-free, discounts, coupon codes, student offers and supermarket finds.
- Categories: 泡泡玛特, 美食, 奶茶咖啡, 美妆, 时尚服饰, 潮玩手办 on both tabs, plus 超市好物 (Lidl, Aldi, Tesco, 华人超市…) on 羊毛优惠 only.
- **新** marks items found in the last 3 days. **★** marks stand-out items (new openings, limited drops, discounts of 30% or more, freebies). The **★ 只看精选** switch shows only those.

## How it works

```
GitHub Actions (every morning)         GitHub Pages
┌──────────────────────────────┐       ┌──────────────────────┐
│ agent/update-feed.mjs         │       │ site/index.html      │
│  └ Claude + web search        │──────▶│  reads               │
│    (13 searches: each tab ×   │ saves │  site/data/feed.json │
│     its categories)           │       └──────────────────────┘
│  └ new ★ items → Server酱      │──▶ WeChat message (微信提醒)
└──────────────────────────────┘
```

1. **The agent runs in GitHub Actions**, on GitHub's own machines, once a day (around 8am UK time). You can also run it any time from the Actions tab. GitHub Pages only serves files, so the agent can't run on the page itself. Your Anthropic API key is kept as a repository secret and never reaches the page.
2. For each tab and category, Claude uses Anthropic's **web search** tool, set to Manchester. It runs at least three **Chinese searches** using the words people actually post with: 曼城, 今日羊毛, 🆓, 买一送一, BOGO, 快闪, 新店开业, 好物推荐… (e.g. `曼城 今日羊毛`, `曼城 泡泡玛特 site:xiaohongshu.com`), plus an English search. The prompt includes three real Xiaohongshu posts as examples of what's wanted (a Pop Mart free-gift draw, a 茶宴 Chayan BOGO, a Lidl product tip). Claude then uses **web fetch** to open the most promising public notes and check their dates and details, and reports structured results through a `report_findings` tool.
3. Claude writes every result in Simplified Chinese, with English place names alongside so they're easy to find on a map. Results are saved to `site/data/feed.json` in the repo, and the page is republished.
4. **WeChat notifications:** if a run finds new ★ items (freebies, BOGO, one-day events, new openings…), a message titled e.g. **曼城今日羊毛3条：…** arrives in WeChat through [Server酱](https://sct.ftqq.com/). It lists the items with links and a link to the page. No ★ items means no message that day. The first run sends a welcome message (曼城快闪已开通) with that day's ★ items.

**Limits on Red Note (Xiaohongshu) coverage:** the agent can't log in to Xiaohongshu or read posts inside the app. It only finds posts that are public on the web and indexed by search engines, plus reposts on other sites. Each card shows its source, so check the original before you go.

## Setup (one time, in the GitHub website)

1. **Add your API key:** repo **Settings → Secrets and variables → Actions → New repository secret**. Name it `ANTHROPIC_API_KEY` and paste your key from console.anthropic.com.
2. **Turn on Pages:** **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Connect WeChat (Server酱):** on her phone, open https://sct.ftqq.com/ and log in by scanning the QR code with WeChat. Follow the 方糖 service account when asked so messages can reach her (this is the "微信推送" / message channel setting). Copy the **SendKey** (starts with `SCT`, or `sctp` for Server酱³), then add it as a second repo secret named `SERVERCHAN_SENDKEY`. The free plan has a small daily message limit, which is plenty for one message a day.
4. **Make this the default branch** (or merge it into `main`). Scheduled runs only happen on the default branch.
5. **Check WeChat:** **Actions → Update feed → Run workflow**, untick "Run the agent", tick "Send a WeChat test message". She should get **曼城快闪：测试消息** within a minute.
6. **First run:** **Actions → Update feed → Run workflow** with the defaults. It takes about 5–10 minutes, then the page is at `https://nbjdttn.github.io/popup-local/` and the welcome message arrives in WeChat.

## Cost

Each run makes 13 Claude searches (Claude Opus 5.5, each with up to 8 web searches and 5 page fetches). Web search costs $10 per 1,000 searches, plus tokens for reading the results. Expect roughly a few dollars per run, and there is one run a day. Check your usage in the Anthropic Console after the first run. To spend less, remove categories in `agent/config.mjs`, or run every few days by editing the `cron` line in `.github/workflows/update-feed.yml`.

## Changing things

- **Categories / area:** `agent/config.mjs` (`name` is the internal key, `zh` is what the page shows)
- **What the agent looks for:** `buildPrompt()` in `agent/agent.mjs`
- **Schedule:** `cron` in `.github/workflows/update-feed.yml`
- **WeChat message wording:** `buildMessage()` in `agent/wechat.mjs`
- **Page design:** `site/`

## Files

```
site/index.html, app.js, style.css   the page (plain HTML/JS, no build step)
site/data/feed.json                  results, written by the agent
agent/config.mjs                     Manchester + categories
agent/agent.mjs                      the Claude + web search agent
agent/update-feed.mjs                runs all searches, merges, sends the WeChat message
agent/wechat.mjs                     Server酱 sender and message text
agent/mock-test.mjs                  offline test with a fake API (npm test)
.github/workflows/update-feed.yml    daily schedule, save, publish, WeChat test
```

To try it on your own computer (optional): `npm install`, then `npm test`. Run `ANTHROPIC_API_KEY=... npm run update` for a real search, and `npm run preview` to view the page at http://localhost:8000.
