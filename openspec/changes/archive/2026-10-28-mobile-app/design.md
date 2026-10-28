# Design

## Context

The foundation (#58, PR #60) provides the tables and events this change needs: `device` (one row per unique Expo push token), `suggestion`, `approval`, `wovain/notify`, `wovain/approval.requested` and `wovain/trigger.fired`. The existing oRPC procedures already cover runs, designs, ideas and insights. The research note for this change (mobile and voice scoping, 2026-10-28) compared a PWA, Capacitor and Expo, and picked Expo in the monorepo. Better Auth supports Expo officially, and native push supports action buttons.

## Goals

- A demoable app against next.wovain.com's API: sign in, see what is waiting, decide, check KPIs.
- Push notifications for approvals and suggestions.
- A mic slot that the voice workstream can fill without changing the layout.

## Non-goals

- Store submission, store listings and screenshots.
- Product and campaign editing, billing and connections. The app links to the website for these.
- Hold-to-talk itself, which belongs to the `voice-input` workstream.

## Decisions

- **Expo SDK 58 with Expo Router and plain `StyleSheet`.** NativeWind's Tailwind 4 support is still changing. Brand tokens in one file are enough for four screens.
- **React from a named catalog (`catalog:mobile`).** React Native requires React to match its renderer exactly, so the app can't use the web's `react` range.
- **Auth.** The client is `expoClient({ scheme: "wovain", storage: SecureStore })`. oRPC's `RPCLink` sends `authClient.getCookie()` as the `Cookie` header with `credentials: "omit"`, as Better Auth's Expo guide shows. The server adds `expo()` and `wovain://`, and adds `exp://` only when `NODE_ENV` is `development`.
- **Flag.** Server procedures and push functions read `mobile-app` for the merchant. When it is off, `devices.*` and `inbox.list` answer 404 and nothing is pushed. On a 404 the app shows that the feature isn't available yet.
- **Push.** `expo-server-sdk` sends in chunks. A ticket with `DeviceNotRegistered` deletes that token at once. This change doesn't poll receipts: the ticket error covers the common case, and Expo drops receipts after a day. Each failure is logged at error level through evlog.
- **Fan-in.** Producers keep sending their domain events. Two small functions turn `approval.requested` and `trigger.fired` (when it carries a `suggestionId`) into `wovain/notify`, so a single function owns delivery.
- **Env.** The app reads `EXPO_PUBLIC_API_URL` through Varlock's Expo integration (`apps/mobile/.env.schema`). The server reads an optional `EXPO_ACCESS_TOKEN`, which is needed only once Expo's enhanced push security is turned on.

## Risks

- iOS push and TestFlight need an Apple Developer account, and Android push needs FCM credentials in EAS. Until both exist, push works only in development builds that have credentials.
- The EAS project ID comes from `eas init` under the founder's Expo account, and push tokens need it.
