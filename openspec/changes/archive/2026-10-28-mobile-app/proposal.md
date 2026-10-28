# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/81

## Why

Merchants decide on the go. An agent proposes a drop, a design waits for approval, a reprice waits in the queue. Today every one of these decisions needs the website. The foundation (#58) added the approval queue, suggestions, the `device` table and the `wovain/notify` event, but none of it reaches a phone. Voice input is first-class on mobile, so the app also has to leave room for hold-to-talk.

## What Changes

- `apps/mobile` is an Expo app (SDK 58, Expo Router) in the monorepo, behind the `mobile-app` flag:
  - Sign-in uses Better Auth's Expo client (`@better-auth/expo`), with the session kept in SecureStore.
  - The app uses the shared oRPC client with the `AppRouter` types and sends the session cookie.
  - It has four tabs: the suggestions inbox, the approvals queue, drops and designs review, and KPIs.
  - Each tab has a mic button slot for the voice workstream's hold-to-talk. The button stays disabled until the `voice-input` workstream fills it.
  - Push: the app asks for permission, registers the Expo push token and opens the right tab when a notification is tapped.
  - `eas.json` has development, preview (internal distribution) and production profiles, plus submit profiles for TestFlight internal and the Play internal track. This change submits nothing.
- Auth gets the `expo()` server plugin and the `wovain://` scheme in `trustedOrigins`. `exp://` is added only in development.
- API, behind `mobile-app`:
  - `devices.register` and `devices.unregister` save Expo push tokens in the foundation `device` table.
  - `inbox.list` lists the merchant's new suggestions and counts pending approvals.
- Inngest functions, on the app's Inngest client:
  - `push-notify` sends a `wovain/notify` event to the merchant's devices through the Expo Push Service. It deletes tokens that Expo reports as not registered.
  - `push-approval-requested` turns `wovain/approval.requested` into a notify event.
  - `push-suggestion` turns `wovain/trigger.fired` with a saved suggestion into a notify event.
  - All three skip merchants who have `mobile-app` off.

## Capabilities

### New Capabilities

- `mobile-app`: the Expo app, its sign-in, screens, device registration and push notifications.

## Impact

- New workspace `apps/mobile`. React and React Native come from the `mobile` named catalog, because React Native pins its own React.
- `packages/auth`: `@better-auth/expo` (catalog), the plugin and the scheme.
- `packages/api`: `flow/devices.ts`, `flow/push.ts`, `routers/devices.ts`, `workflows/push.ts`, plus one line each in `routers/index.ts` and `workflows/engine.ts`.
- No migration: the `device` and `suggestion` tables come from the foundation.
- Founder steps:
  - Create an Expo account and run `eas init`, which writes the EAS project ID.
  - Get an Apple Developer account for TestFlight.
  - Create a Play Console app for internal testing.
  - Upload FCM credentials to EAS.
