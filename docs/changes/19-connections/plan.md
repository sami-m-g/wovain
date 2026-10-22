# Plan: merchant connections for Fourthwall and fal

Spec: [spec.md](spec.md)

One branch, `feat/19-connections`, and one MR with a commit per chunk. Chunk 1 alone would be unused code (knip fails on it), and chunk 3 reuses chunk 2's client, so they don't merge separately.

## Files that change

Chunk 1, connection storage:

- `apps/server/package.json`, `pnpm-lock.yaml`: `@google-cloud/kms` 6.3.0; `@modelcontextprotocol/client` moves to `dependencies`.
- `infra/index.ts`: key ring `wovain`, key `connections` (rotation `7776000s`, `protect`), the runner's `cryptoKeyEncrypterDecrypter` on the key, `roles/cloudkms.admin` for the infra account, TTL fields on `oauthFlows` and `connectTickets`; `fal-billing-key` leaves the secret list (chunk 3).
- `apphosting.yaml`: `WOVAIN_KMS_KEY`.
- `apps/server/src/env.ts`: `WOVAIN_KMS_KEY` (optional).
- `apps/server/src/lib/cipher.ts` (new): KMS and AES-GCM ciphers.
- `apps/server/src/lib/connections.ts` (new): providers, records, tickets, flows, versioned writes.

Chunk 2, Fourthwall connect:

- `apps/server/src/lib/oauth-client.ts` (new): `FirestoreOAuthProvider`, client metadata.
- `apps/server/src/lib/upstream.ts` (new): `connectedCall` with the lease, the reconnect rules and the `needsConnection` result.
- `apps/server/src/routes/connect.ts` (new) and `apps/server/src/app.ts`: the three routes.
- `apps/server/src/tools/connections.ts` (new): `fourthwall` (and `fal` in chunk 3).
- `apps/server/src/server.ts`, `http.ts`, `runtime.ts`, `routes/mcp.ts`, `test/helpers.ts`: pass the connections and the user id through.
- `apps/server/src/playbooks/index.ts`: the `instructions` text.

Chunk 3, fal connect:

- `apps/server/src/tools/connections.ts`: the `fal` tool.
- `apps/server/src/tools/ads.ts`: `generate_videos`, `add_video_audio`; `video_spend` removed.
- `apps/server/src/lib/video-plan.ts`: the estimate note no longer names `video_spend`.
- `apps/server/src/playbooks/ads.ts`: steps 2, 3 and 5.
- Removed: `apps/server/src/lib/fal-usage.ts`, `apps/server/test/unit/fal-usage.test.ts`, `FAL_BILLING_KEY` in `env.ts`, `.env.example`, README, the `apphosting.yaml` comment, `test/integration/store.test.ts`.

Docs: `docs/spec.md` (tools, keys, data model, external services), `docs/app-map.html`, README env table and the connections note, AGENTS.md (run-the-server bullet), `verify.md`.

Tests:

- `test/unit/cipher.test.ts`: round trip, wrong AAD fails, tampered ciphertext fails.
- `test/integration/connections.test.ts`: record schema on read, ticket single use and expiry, flow load-and-delete, version-checked delete.
- `test/integration/upstream.test.ts`: a fake upstream (resource and AS metadata, a token endpoint that rotates refresh tokens, an MCP server that checks the bearer) reached through an injected `fetch`. Covers: no grant gives the connect link; the full connect then a call; refresh near expiry; two concurrent refreshes spend the refresh token once; `invalid_grant` with no newer grant gives `reconnect: true`; Fourthwall-style `isError` plus `mcp/www_authenticate` gives `reconnect: true`; a tool outside the allowlist is rejected by the input schema.
- `test/integration/connect-routes.test.ts`: client.json, bad ticket 400, ticket to 302 with `state`, `code_challenge` and `resource`, callback stores encrypted tokens (no token text in the doc), wrong-provider callback refused.
- `test/integration/ad-tools.test.ts`: `generate_videos` sends the planned inputs only; `add_video_audio` rejects non-fal URLs; both return the connect link without a grant. The `video_spend` test goes.

## Order of work

1. Plan commit (this file, intent, spec), labels to `status::doing`.
2. Chunk 1: dependency, cipher, connections store, infra, env, tests. Commit `feat(connections): store merchant grants encrypted with cloud kms`.
3. Chunk 2: OAuth provider, upstream call, routes, `fourthwall` tool, wiring, instructions, tests. Commit `feat(connections): connect fourthwall through wovain`.
4. Chunk 3: `fal` tool, `generate_videos`, `add_video_audio`, removals, playbook, tests. Commit `feat(connections): connect fal and generate videos on the merchant's grant`.
5. Docs, humanizer pass.
6. Every check: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm infra:preview`.
7. `/simplify` and a review for silent failures, fixes, `verify.md`, push, MR. The author doesn't merge it (AGENTS.md).

## Risks

- **Infra account can't set KMS IAM.** `roles/editor` has no `setIamPolicy` on keys. The plan grants `roles/cloudkms.admin` to the infra account in the same stack (it holds `projectIamAdmin`), with `dependsOn`. If the first `pulumi up` races it, a rerun of `infra:production` fixes it. `pnpm infra:preview` shows the resources but not IAM permission errors.
- **Deploy before the key exists.** `deploy:production` needs `infra:production`, so the key and IAM land first.
- **Protected key.** The key can't be deleted by Pulumi; destroying it later is a manual step (KMS keys can't be deleted anyway, only their versions).
- **Unknown token lifetimes.** If Fourthwall or fal issue no `expires_in`, proactive refresh never runs and the SDK's 401 path handles it. Recorded in `docs/spec.md` after the first real connect.
- **Fourthwall's 200-with-isError.** Detected by `_meta["mcp/www_authenticate"]`; if Fourthwall changes the shape, the merchant sees the upstream error text instead of the link. The test pins today's shape.
- **Spending moves server-side.** `generate_videos` spends the merchant's fal credits. Inputs come only from the stored plan, and the playbook still says the estimate first. No retry happens inside the tool.
- **Local development** needs an https tunnel for CIMD (providers fetch `client.json`).
- **Tool count** goes from 11 to 14 for the host model.

## Tests that prove it

The tests above, plus every check in step 6. Manual proof after deploy: from ChatGPT, ask wovain for the Fourthwall shop, follow the connect link, approve, say "done", and see `ecommerce_get-current-shop` answered through wovain; then the same for fal with `check_account_status`.
