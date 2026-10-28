# Tasks

Issue #81.

## 1. Auth

- [x] 1.1 `@better-auth/expo` in the catalog; the `expo()` plugin and the `wovain://` scheme in `trustedOrigins` (`exp://` in development)

## 2. API

- [x] 2.1 `flow/devices.ts`: register (upsert by token, moving it to the new owner) and unregister, behind `mobile-app`
- [x] 2.2 `inbox.list`: new suggestions and the count of pending approvals
- [x] 2.3 `flow/push.ts`: Expo push sender that deletes tokens Expo reports as not registered and logs failures at error level
- [x] 2.4 `workflows/push.ts`: `push-notify`, `push-approval-requested` and `push-suggestion` on the app's Inngest client

## 3. App

- [x] 3.1 `apps/mobile`: Expo SDK 58, Expo Router, Varlock env, the shared oRPC client
- [x] 3.2 Sign-in (email and password, Google)
- [x] 3.3 Tabs: inbox, approvals, review (runs at the ideas gate, designs waiting), KPIs
- [x] 3.4 Mic button slot on each tab
- [x] 3.5 Push permission, token registration, opening the tab from a notification
- [x] 3.6 `eas.json` with internal distribution and submit profiles (not run)

## 4. Checks

- [x] 4.1 Tests for devices, push delivery and the fan-in functions
- [x] 4.2 `pnpm run check`, `check-types`, `knip`, `spec:validate`
