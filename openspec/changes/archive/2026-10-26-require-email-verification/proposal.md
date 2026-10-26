# Proposal

Issue: https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/53 (#53). Branch: `fix/auth-email-and-linking` (MR !149).

## Why

An email sign-up signed the merchant straight into the app with an unverified address. Unverified accounts can't link Google later (Better Auth's `requireLocalEmailVerified`), and a typo in the address goes unnoticed until a password reset fails.

## What Changes

- `packages/auth`: `emailAndPassword.requireEmailVerification` is on, and `emailVerification.sendOnSignIn` sends a new link when an unverified account signs in. Sign-up answers without a session, and a taken email gets the same answer as a new one. The link verifies the email and signs the merchant in (`autoSignInAfterVerification`), then redirects to `/dashboard`, also for a link sent by a refused sign-in, which names no destination. `/send-verification-email` is limited to 3 a minute per IP.
- `apps/web`: Better Auth UI's `requireEmailVerification` sends sign-up, and a sign-in refused with `EMAIL_NOT_VERIFIED`, to its verify-email view: "Check your email" with open-inbox and resend buttons. wovain adds the heading and a "Sign up with a different email" link, in en, fr and es.
- The `account_not_linked` error page now says to confirm the email first, since an unverified account can't sign in with its password any more.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `auth`: password accounts need a verified email to sign in.

## Impact

- Existing unverified password accounts get a new link at their next sign-in instead of a session.
- Google sign-in is unchanged: Google verifies the email.
