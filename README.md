# Popup Local

A phone app (iOS and Android) with a small AI agent that finds **new pop-ups** and **new discounts** near you.

- **Pop-ups tab**: pop-up shops, store openings, launch events and limited drops.
- **Deals tab**: current discounts, sales, coupon codes and member offers.
- Both tabs share the same **categories**, shown as chips at the top: Pop Mart, Food, Coffee & Desserts, Fashion, Beauty, Toys & Collectibles. You can add, remove or rename categories in **Settings**.

Tap a chip and pull down (or press **Search \<category\>**) to run the agent for that category. **Search all** runs every category one by one. Results are saved on the phone, so they're still there next time you open the app. Tap a card to open its source page.

## How the agent works

`src/lib/agent.ts` sends the request straight from the phone to the Anthropic API (Claude Opus 5.5) with:

1. Anthropic's server-side **web search** tool, using your city and country to get local results.
2. A `report_findings` tool with a strict schema. Claude calls it once it has finished searching, so the app gets structured cards (title, brand, dates, location, offer, source URL) and not free text.

The prompt asks for items that are running now or start within the next 30 days, each with a real source link. The app also drops any result that has no valid URL, and removes duplicates. If a safety check declines a request, the server-side fallback (`fallbacks: "default"`) retries it on another model.

There's no backend. You add your own Anthropic API key in Settings, and the app stores it in the phone's secure keychain (`expo-secure-store`). The key is sent only to `api.anthropic.com`. Each category search takes about 30–90 seconds and costs a few cents of API usage.

## Project layout

```
src/app/_layout.tsx        bottom tabs: Pop-ups, Deals, Settings
src/app/index.tsx          Pop-ups tab
src/app/deals.tsx          Deals tab
src/app/settings.tsx       city, categories, API key
src/components/FeedScreen.tsx   category chips, list, refresh, "Search all"
src/components/FindingCard.tsx  one result card
src/lib/agent.ts           the Claude + web search agent
src/lib/storage.ts         settings, keychain and cached results
scripts/mock-agent-test.ts      offline test of the agent loop (mocked API)
```

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go, or press a / i
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
