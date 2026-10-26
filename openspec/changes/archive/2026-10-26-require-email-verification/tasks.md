# Tasks

## 1. Server

- [x] 1.1 `requireEmailVerification` and `sendOnSignIn` in `packages/auth/src/index.ts`, with a rate limit on `/send-verification-email`
- [x] 1.2 Tests on PGlite: no session at sign-up, link on `BETTER_AUTH_URL`, sign-in refused and a new link sent, the link verifies and signs in to `/dashboard`, taken email answered alike

## 2. Web

- [x] 2.1 Better Auth UI `requireEmailVerification`, so sign-up and an unverified sign-in show the verify-email view
- [x] 2.2 "Check your email" heading and "Sign up with a different email" link, in en, fr and es
- [x] 2.3 French verify-email strings; `account_not_linked` copy says to confirm the email first

## 3. Docs

- [x] 3.1 Getting started says to confirm the email, in en, fr and es
