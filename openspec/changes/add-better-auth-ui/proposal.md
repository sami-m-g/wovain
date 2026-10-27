# Proposal

PR: `fix/google-button-runtime-env`. Status: in review.

## Why

The hand-rolled auth screens drifted from Better Auth, and the Google button was missing in production: Varlock inlined `GOOGLE_CLIENT_ID` at build time, so it was empty at runtime. Designers also had no place to manage their account.

## What Changes

- Read the Google client id at runtime (`@dynamic`, after `connection()`), so the Google button renders in production.
- Replace the hand-rolled sign-in, sign-up and reset screens with Better Auth UI (base-nova shadcn registry), themed with wovain tokens and copy.
- Add account and security settings (profile, sessions, linked accounts).
- `packages/ui` exports map to `src`, so the shadcn CLI writes vendored files in place.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `auth`: adds account settings and requires the Google option to be available at runtime.

## Impact

`apps/web` auth pages and settings, `packages/ui` exports, `apps/web/.env.schema`. No schema change. The ChatGPT OAuth login must be checked on a preview.
