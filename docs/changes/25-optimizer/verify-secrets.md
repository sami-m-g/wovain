# Verify: the optimizer's generated secrets (#25)

Before this change `OPTIMIZER_CUSTOMER_KEY` and `META_WEBHOOK_VERIFY_TOKEN` had no value in production, so `/webhooks/fourthwall` answered 503 (verify-mr1.md) and Meta's URL check could never pass.

## What changed

- `infra/index.ts` makes both values with `@pulumi/random` (`RandomBytes`, 32 bytes, base64, so 44 characters, over the 32 that `env.ts` asks of the customer key). No one pastes a value, and none is printed. The values live only in Pulumi's encrypted state and in Secret Manager.
- `meta-webhook-verify-token` joins `secretNames`, so both secrets get a Secret Manager version and the runner's `secretAccessor` and `viewer` grants, the same as every other secret.
- `apphosting.yaml` lists `OPTIMIZER_CUSTOMER_KEY` and `META_WEBHOOK_VERIFY_TOKEN`. CI's `infra:production` (`pulumi up`) runs before `deploy:production`, so the versions exist before App Hosting builds.
- `@pulumi/random` 4.21.2 is pinned exactly in `infra/package.json`. 4.21.3 and 4.21.4 are less than two weeks old.
- Rotating either value means replacing its `RandomBytes` resource (`pulumi up --replace`). A new customer key changes every buyer's customer key, so repeat-rate counts start over.

## Checks run

| Check | Result |
| --- | --- |
| `pnpm check` | pass |
| `pnpm typecheck` | pass (covers `infra/`) |
| `pnpm knip`, `pnpm arch`, `pnpm dupes` | pass, 0 clones |
| `pnpm test` | pass, 228 |
| `pnpm test:integration` | pass |
| `pnpm build`, `pnpm test:stories`, `pnpm test:e2e` | pass |
| `pnpm infra:preview` | 9 to create: the two `RandomBytes`, the `meta-webhook-verify-token` secret and its two runner grants, a version for each secret, plus MR 1's queue enqueuer grant and events TTL field, which main hadn't applied yet. Nothing to update or delete. The Compute API region warning was already there. |

## Try it

After the merge pipeline's `pulumi up`, `/webhooks/fourthwall` answers 401 to an unsigned body instead of 503. `GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1` still answers 403. Only Meta's app subscription (MR 7) sends the right token.
