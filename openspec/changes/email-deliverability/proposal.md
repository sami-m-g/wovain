# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/197

## Why

Gmail and Yahoo require bulk senders to offer one-click unsubscribe (RFC 8058) on non-essential mail and to authenticate with SPF, DKIM and DMARC ([Google](https://support.google.com/a/answer/81126), [Yahoo](https://senders.yahooinc.com/developer/documentation)). Resend's [deliverability guide](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-transactional-emails) adds: turn click and open tracking off for transactional mail, use a real reply address, and send more text than image. wovain's run updates had none of this.

## What Changes

- Run updates carry `List-Unsubscribe` (mailto and https) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, plus a visible unsubscribe link in en, es and fr.
- `/api/unsubscribe` takes the signed link: POST unsubscribes (one click), GET shows a confirm button. Opted-out addresses get no run updates (`email_opt_out` table).
- Verification and reset email stays essential: no unsubscribe, always sent.
- Every email sets `replyTo` (`EMAIL_REPLY_TO`) and prints its link as text.
- `infra/resend.ts` can turn the domain's open and click tracking off (`resendTracking: off` stack config, opt-in; prod's config is untouched).
- Prod DMARC is not changed here; that waits until after 11-16.

## Capabilities

### New Capabilities

- `email-deliverability`

### Modified Capabilities

None.
