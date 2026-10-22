# Verify: merchant connections for Fourthwall and fal

## Tests added

- `test/unit/cipher.test.ts`: a sealed grant opens only with the same document path (AAD) and key; a tampered ciphertext fails.
- `test/integration/connections.test.ts`: grants are stored encrypted and read back; refresh keeps `connectedAt` and bumps `version`; a ciphertext copied to another user's doc doesn't open; a stale delete leaves a newer grant; one lease at a time and none on a changed grant; tickets work once, for their provider, within 5 minutes; flows are taken once, only with their own browser nonce and purpose.
- `test/integration/upstream.test.ts`, against `test/fake-upstream.ts` (resource and AS metadata with CIMD, a token endpoint that checks PKCE and rotates refresh tokens, an MCP server that wants a bearer token) with the SDK's real client code:
  - no grant gives a connect link;
  - the full connect, checking `client_id` (CIMD URL), `redirect_uri`, `resource` and S256;
  - a used state can't be exchanged twice;
  - another browser's nonce can't finish a flow, and the flow survives for the right browser;
  - a grant near expiry is refreshed once even when two instances call at the same moment;
  - an expired access token is refreshed on the 401;
  - a revoked grant and Fourthwall's login-needed answer both give `reconnect: true` and remove the grant.
- `test/integration/connect.test.ts`: the routes with the real browser sign-in and upstream client: `client.json`; a missing, unknown or reused ticket; the full sign-in then connect in one browser (grant stored, no token text in the doc); a sign-in callback with no cookie or another cookie; a different wovain account than the link's (403); a provider callback from another browser or for another provider; a declined consent. The proxy tools: a personal connect link before connecting, tools outside the allowlist refused (including fal `submit_jobs` and Fourthwall `update-offer-status`), an allowed call forwarded, and `configured: false` without a key.
- `test/integration/ad-tools.test.ts`: `generate_videos` sends exactly the planned clips to fal `submit_jobs`; `add_video_audio` refuses non-fal URLs; both give a connect link before fal is connected. The `video_spend` test is gone with the tool.

## Checks run

All pass on the branch head:

- `pnpm check`
- `pnpm typecheck`
- `pnpm knip`
- `pnpm arch`
- `pnpm dupes` (0 clones)
- `pnpm test` (86, after rebasing on 0.19.1)
- `pnpm test:integration` (80)
- `pnpm build`
- `pnpm infra:preview`: 6 to create (key ring `wovain`, key `connections`, `infra-cloudkms.admin`, the runner's `cryptoKeyEncrypterDecrypter` on the key, TTL fields on `connectTickets` and `oauthFlows`), 3 to delete (the `fal-billing-key` secret and its two IAM bindings), 140 unchanged.

## Review findings

Security review (from the coordinator), all fixed in `fix(connections): bind connect links to the merchant's browser sign-in`:

- **High, login CSRF:** the connect flow wasn't bound to the browser that started it. Now `/connect/:provider` sets an HttpOnly, Secure, SameSite=Lax nonce cookie (path `/oauth/callback`, 10 minutes, `hono/cookie`), every flow stores the nonce's hash, and both callbacks refuse a missing or different cookie before the flow is taken; a mismatch leaves the flow alone.
- **High, link opened by the wrong person:** the connect link passes through the model's context. `/connect/:provider` now sends the browser to sign in to wovain through AuthKit, and only goes on to the provider when the signed-in user is the ticket's user (403 page otherwise). wovain signs the browser in as a CIMD client of its own `/mcp` with the SDK's `auth()`, and checks the token exactly as `/mcp` does (`auth.gate` plus the allowlist), so it needs no new WorkOS client id, cookie password or redirect URI. This departs from the suggestion to use `@workos-inc/node`'s session helpers: those need the environment's client id and a cookie-sealing secret, which the stack doesn't have, and the SDK route reuses the sign-in `/mcp` already trusts.
- **Medium, ticket as a bearer capability:** tickets are single-use and now last 5 minutes, and the tool reply says the link is personal and needs a wovain sign-in.

`/simplify` (reuse, simplification, efficiency, altitude), fixed:

- The lease returns a boolean, and the unread `leaseId` and three-way status are gone.
- Version checks (`waitForNewer`, after a 401) read the version without a KMS decrypt (`connections.version`).
- Fourthwall's login-needed answer goes through the same "newer grant? retry once : reconnect" path as a 401, and a grant the SDK already invalidated isn't removed twice.
- The upstream reply uses `userSafe` instead of its own log-and-rethrow.
- The proxy tools loop over `providerSchema.options`.

Skipped, with reasons:

- A client and discovery cache per merchant (about 3 extra round trips per proxied call, and rediscovery on each refresh): worth doing once real latency is measured; not needed for correctness.
- An in-process grant cache (one Firestore read and one KMS decrypt per call): the same; the cost is small at today's volume ($0.03 per 10,000 decrypts).
- Splitting `FirestoreOAuthProvider` into storage strategies instead of the `callback` and `signIn` options, and merging `authorize`/`finishConnect` with the sign-in pair: a larger refactor than this MR needs; `pnpm dupes` finds no clones.
- Routing every refresh through the lease (a read-only provider for the transport): the transport's 401 path needs a provider that can refresh; the version check after a 401 covers the race.
- A shared HTML layout for the home page and the connect pages, and a `verifyAccessToken` export from `auth/auth.ts`: both touch code outside this change (the second is in `auth/`); noted for a follow-up.

## Try it

After the deploy (the key and IAM are created by `infra:production` first):

1. In ChatGPT (or Claude) with wovain connected, ask: "Show my Fourthwall shop through wovain." The agent calls wovain `fourthwall` with `get-instructions`, and wovain answers with a personal link.
2. Open the link within 5 minutes, in the browser you use for wovain. Sign in to wovain (AuthKit) with the same account, then approve on Fourthwall's page. The tab says "Fourthwall connected".
3. Say "done". The agent retries; `ecommerce_get-current-shop` answers through wovain.
4. For fal, ask "Check my fal account status through wovain", open the link and approve on fal's page, then say "done".
5. To test the guards: open a used link (expired page), or sign in as another wovain account (403 page).

Record the token lifetimes and whether each provider rotates refresh tokens in `docs/spec.md` after the first real connect.

## Departures from the plan

- The security fix (browser sign-in, nonce cookie, 5-minute tickets) wasn't in the plan; see Review findings.
- `video_spend` is removed rather than moved to the merchant's grant: fal's MCP has no per-request cost field I could confirm. The ads playbook points at `search_request_history` instead.
- The `fal` proxy tool landed in the Fourthwall commit, since both proxies share one loop.
- Commits: plan, storage, Fourthwall and fal connect, the security fix, the fal generation tools, and docs.
