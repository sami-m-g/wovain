# Verify: optimizer MR 1, event intake and the task backbone

Plan: MR 1 in [plan.md](plan.md) (on the `feat/optimizer` branch until the plan lands).

## First check: Fourthwall webhook registration on #19's token

The question was whether the Fourthwall token from #19's MCP connection (`mcp.fourthwall.com/app`) can call `GET` and `POST /open-api/v1.0/webhooks`.

- `GET https://api.fourthwall.com/open-api/v1.0/webhooks` with no token answers 401 with `WWW-Authenticate: Bearer realm="Fourthwall"` and `Basic realm="Fourthwall"`. The Platform API takes a Platform OAuth token or Basic auth.
- The MCP grant comes from a different authorization server. `https://mcp.fourthwall.com/.well-known/oauth-authorization-server` names `https://mcp.fourthwall.com/` as the issuer, with `scopes_supported: openid, profile, email, offline_access`. `webhook_write` isn't on that list, and the protected resource is `https://mcp.fourthwall.com/`, not the Platform API.
- I haven't run a live call with the stored grant. Decrypting a production grant to try it was refused in this session, and it should be a call the owner makes.

Result: unverified live, and very likely no. A token from the MCP issuer, scoped to the MCP resource, without `webhook_write`, isn't something the Platform API should accept. Until a live check says otherwise, MR 4's poll is the only Fourthwall path. Fourthwall webhooks need the Platform App (a second OAuth grant with `webhook_write`, signed with `X-Fourthwall-Hmac-Apps-SHA256`). The intake already accepts that header with `FOURTHWALL_APP_HMAC_KEY`. To settle it, the owner can run `GET /open-api/v1.0/webhooks` with their MCP access token (status code only).

`optimizer/register.ts` takes whichever token works. Nothing calls it from a tool yet; the settings toggle that does is MR 5 and MR 6.

## Tests added

- `apps/server/test/unit/optimizer-signatures.test.ts`:
  - Fourthwall HMAC (base64) and Meta `sha256=<hex>` on the raw body. Each fails with the wrong secret, a missing header or secret, an empty secret, a re-serialized or one-byte-longer body, and a malformed header.
  - Meta's verify token.
  - The task OIDC token, checked against a local JWKS. Only the task account's token for this audience passes; another account, another audience, no configured account, no token and junk all fail.
  - Task names keep only allowed characters.
  - `ALREADY_EXISTS` from Cloud Tasks counts as queued, and other errors are thrown.
  - The in-memory queue dedupes by name.
- `apps/server/test/integration/optimizer-intake.test.ts` (emulators):
  - Registration stores the webhook id with the secret only encrypted, plus the `fourthwallShops` route.
  - A bad or missing signature gets 401 and stores nothing.
  - An unknown shop gets the same 401 as a bad signature, so the endpoint tells a sender nothing; nothing is stored.
  - A shop's secret is decrypted at most once a minute, and every delivery is checked against the cached secret, so a flood of forgeries doesn't block a correctly signed delivery. Only cache misses (KMS decrypts) are throttled, after 10 failures a minute per merchant. A secret that won't decrypt signs nothing and isn't cached.
  - A Platform App signature is checked first and skips the per-shop path and its throttle, also after a flood of forgeries.
  - Registration refuses a shop already routed to another merchant, checked before Fourthwall is called and again in the write transaction.
  - Without `OPTIMIZER_CUSTOMER_KEY`, Fourthwall events get 503 and nothing is stored.
  - The same event twice is stored once, and the stored event has no buyer email or name.
  - 20 orders in one window make one task.
  - A body over 1 MB gets 413.
  - Meta's challenge is answered only for the verify token.
  - A Meta batch with mixed accounts stores each routed change once, drops the unknown account and makes one task per merchant. A replayed batch stores nothing new.
  - An unsigned Meta batch gets 401.
  - `/tasks/optimizer/run` refuses an invalid task token with 401 and marks a merchant's events processed.
  - Lease contention re-enqueues the run 60 s later.
  - A merchant who hasn't turned the optimizer on is skipped.

## Checks run

| Check | Result |
| --- | --- |
| `pnpm check` (with `skills:check`) | pass |
| `pnpm typecheck` | pass |
| `pnpm knip` | pass |
| `pnpm arch` | pass |
| `pnpm dupes` | pass, 0 clones |
| `pnpm test` | pass, 223 server tests |
| `pnpm test:integration` | pass, 248 tests |
| `pnpm build` | pass |
| `pnpm infra:preview` | 7 to create: the `cloudtasks` and `cloudscheduler` APIs, the `optimizer` queue, the `tasks-invoker` account, the runner's enqueuer and actAs grants, and the events TTL field. 174 unchanged. The Compute API region warning was already there. |

## Security

- Every webhook is checked against its signature on the raw body with `timingSafeEqual` before anything is stored. An empty or unset secret never matches.
- `/tasks/optimizer/run` accepts only a Google-signed OIDC token for its own URL, issued to `WOVAIN_TASKS_SERVICE_ACCOUNT`. Without that account set, every call is refused.
- Events are stored with `create()` under their idempotency key (`fourthwallEventKey`, `metaChangeKey`). A repeat delivery is acknowledged and dropped.
- Buyer names, emails and addresses are dropped by `fourthwallFields` before storing. Meta change values over 2000 characters aren't kept. Bodies are capped at 1 MB.
- The Fourthwall webhook secret is stored only as KMS ciphertext bound to its document path. Nothing logs a payload, a secret or a token. Registration errors carry the status code only.
- No new secret values. `META_WEBHOOK_VERIFY_TOKEN` and `FOURTHWALL_APP_HMAC_KEY` are optional env vars, added to Secret Manager and `apphosting.yaml` once they have values (MR 7, or the Platform App).

## Try it

1. `pnpm dev`. Without `WOVAIN_OPTIMIZER_QUEUE`, tasks run in-process at their scheduled time.
2. Seed `fourthwallShops/sh_1 = { uid }` and a `hooks/fourthwall` secret through `createRegistrar`, as the integration test does.
3. POST a signed `ORDER_PLACED` to `/webhooks/fourthwall`. It answers `stored`, and a second POST answers `duplicate`. About two minutes later, the run marks the event processed.

## Departures from the plan

- A body over 1 MB gets 413, and an unknown shop gets 401 rather than the spec's 404 (security review: no registration oracle). Nothing is stored either way.
- Fourthwall intake needs `OPTIMIZER_CUSTOMER_KEY` (the HMAC key for customer keys, from the security fix on main). It has no value in production yet, so Fourthwall webhooks answer 503 until it is set; no webhook is registered today.
- The "enabled" check reads `optimizerDue/{uid}.enabled`, where `@wovain/shared/optimizer/records` puts it. The state document has no `enabled` field.
- Unprocessed events carry a `pending: true` field. Firestore can't query a missing `processedAt`, so the run clears `pending` and sets `processedAt`. The single-field index covers it, so no composite index is needed yet.
- The scheduler jobs aren't in `infra/tasks.ts` yet. They come with the poll in MR 4. The scheduler API is enabled now.
