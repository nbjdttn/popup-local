# Popup Local

A phone app (iOS and Android) with a small AI agent that finds **new pop-ups** and **new discounts** near you.

- **Pop-ups tab**: pop-up shops, store openings, launch events and limited drops.
- **Deals tab**: current discounts, sales, coupon codes and member offers.
- Both tabs share the same **categories**, shown as chips at the top: Pop Mart, Food, Coffee & Desserts, Fashion, Beauty, Toys & Collectibles. You can add, remove or rename categories in **Settings**.

Tap a chip and pull down (or press **Search \<category\>**) to run the agent for that category. **Search all** runs every category one by one. Results are saved on the phone, so they're still there next time you open the app. Tap a card to open its source page. Cards marked **NEW** weren't there last time, and **★** means the agent thinks the item stands out.

### Settings

- **Use my location**: fills in your city, region and country from the phone's GPS (asks for "while using the app" permission only).
- **Chinese social media** (on by default): the agent also runs Chinese-language searches aimed at Xiaohongshu (小红书 / RED), Weibo, Dianping (大众点评), WeChat articles and Douyin, where many pop-ups are posted first.
- **Results language**: English or 中文. Category names can be in Chinese too, e.g. 泡泡玛特.
- **Notify me about new finds**: background checks plus notifications (see below).

## How the agent works

`src/lib/agent.ts` sends the request straight from the phone to the Anthropic API (Claude Opus 5.5) with:

1. Anthropic's server-side **web search** tool, using your city and country to get local results.
2. A `report_findings` tool with a strict schema. Claude calls it once it has finished searching, so the app gets structured cards (title, brand, dates, location, offer, source URL) and not free text.

With Chinese sources on, the prompt also tells Claude to run at least two Chinese-language searches using the Chinese names of your city and the category (for example `<城市> 泡泡玛特 快闪`, or `site:xiaohongshu.com`), and to drop social posts whose dates it can't confirm. Each result records where it came from (`source`, e.g. "Xiaohongshu").

**Limits on Xiaohongshu coverage:** Xiaohongshu has no public search API, and most notes can only be read inside its app after logging in. The agent can only see notes and reposts that web search engines have indexed, so it catches many popular posts but not everything you would see in the RED app.

**Where it works:** the Anthropic API is only available in [supported countries and regions](https://www.anthropic.com/supported-countries). Mainland China isn't one of them, so the app suits Chinese-speaking communities in places like the UK, US, Australia, Singapore or Hong Kong, not users inside mainland China.

The prompt asks for items that are running now or start within the next 30 days, each with a real source link. The app also drops any result that has no valid URL, and removes duplicates. If a safety check declines a request, the server-side fallback (`fallbacks: "default"`) retries it on another model.

There's no backend. You add your own Anthropic API key in Settings, and the app stores it in the phone's secure keychain (`expo-secure-store`). The key is sent only to `api.anthropic.com`. Each category search takes about 30–90 seconds and costs a few cents of API usage.

## Notifications and background checks

When **Notify me about new finds** is on, the app registers a background task (`src/lib/background.ts`). Each time the phone runs it, the task checks the **next category in turn** on both tabs, compares the results with what was saved before, and posts one notification per tab if there are new items the agent marked as interesting (new openings, limited drops, discounts of 30% or more, freebies, short windows). Tapping the notification opens that tab with that category selected.

The phone decides when background tasks run. The app asks for at most one run every 4 hours, but iOS usually runs them only when the phone is idle and has power or Wi-Fi, so it may be less often. Each run costs about the same as two manual searches.

Background tasks and notifications don't work in Expo Go. Use a development build (`npm run ios` / `npm run android`, or `eas build --profile development`) or a store build.

## Project layout

```
src/app/_layout.tsx        bottom tabs: Pop-ups, Deals, Settings
src/app/index.tsx          Pop-ups tab
src/app/deals.tsx          Deals tab
src/app/settings.tsx       city, categories, API key
src/components/FeedScreen.tsx   category chips, list, refresh, "Search all"
src/components/FindingCard.tsx  one result card
src/lib/agent.ts           the Claude + web search agent
src/lib/refresh.ts         runs a search and works out which items are new
src/lib/background.ts      background task: rotate categories, notify on new finds
src/lib/notifications.ts   permission, Android channel, posting notifications
src/lib/storage.ts         settings, keychain and cached results
scripts/mock-agent-test.ts      offline test of the agent loop (mocked API)
```

## Run it

```bash
npm install
npx expo start          # quick preview in Expo Go (no background checks there)
npm run ios             # development build on the iOS simulator / iPhone (needs a Mac with Xcode)
npm run android         # development build on Android
npm run typecheck
npx tsx scripts/mock-agent-test.ts
```

## Publish to the App Store / Google Play

The app is built with Expo, so you can build and submit from the cloud with EAS. You don't need Xcode or Android Studio.

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios       # needs an Apple Developer account
npx eas-cli@latest submit --platform android   # needs a Google Play Console account
```

Use `--profile preview` to get an Android APK you can install on a phone directly for testing. Before you publish, change `ios.bundleIdentifier` and `android.package` in `app.json` (now `com.popuplocal.app`) to IDs that you own.
