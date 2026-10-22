# Spec: merchant connections for Fourthwall and fal

Intent: [intent.md](intent.md)

## Requirements

1. `apps/server` depends on `@google-cloud/kms` 6.3.0 (exact pin, released Oct 12, Apache-2.0, depends only on `google-gax`, no install scripts) and has `@modelcontextprotocol/client` 2.3.1 in `dependencies` (it was a dev dependency).
2. `infra/` declares a KMS key ring `wovain` and a crypto key `connections` in `us-central1` (90-day rotation, protected), grants the App Hosting runner `roles/cloudkms.cryptoKeyEncrypterDecrypter` on that key only, and adds Firestore TTL policies on `oauthFlows.expiresAt` and `connectTickets.expiresAt`. The infra account gets `roles/cloudkms.admin` so its `pulumi up` can set the key's IAM.
3. `apphosting.yaml` sets `WOVAIN_KMS_KEY` to the key's resource name. Without it, outside the emulators, connections are off and the proxy tools say so (`configured: false`).
4. A connection is a Firestore doc at `users/{uid}/connections/{provider}`, checked with zod on read: `{ provider, ciphertext, connectedAt, refreshedAt, expiresAt?, version, leaseId?, leaseUntil? }`. The SDK's token JSON (access token, refresh token, scope, issuer) is only inside `ciphertext`. Times are epoch milliseconds.
5. Encryption: Cloud KMS `encrypt`/`decrypt` on the token JSON (under 2 KB), with the doc path as `additionalAuthenticatedData`, so a ciphertext copied to another user's doc fails to decrypt. Tests and `pnpm dev` use an AES-256-GCM cipher from `node:crypto` behind the same two-function interface, with the same AAD rule.
6. Client identity is CIMD: `GET /oauth/client.json` serves wovain's client metadata (`client_id` is that URL, the redirect URIs are `/oauth/callback/fourthwall` and `/oauth/callback/fal`, `token_endpoint_auth_method: "none"`, grants `authorization_code` and `refresh_token`). Nothing is registered or stored per provider.
7. The OAuth mechanics are `auth()` and `StreamableHTTPClientTransport` from `@modelcontextprotocol/client`. wovain implements `OAuthClientProvider` over Firestore: tokens on the connection doc; code verifier and discovery state on the pending flow doc.
8. Connect flow:
   - A tool that needs a provider with no grant returns `isError: false`, text "Connect your <Provider> account: <link>" and `structuredContent: { needsConnection: "<provider>", connectUrl, reconnect }`.
   - `connectUrl` is `<site>/connect/<provider>?ticket=<id>`. The ticket is a `connectTickets/{id}` doc `{ userId, provider, expiresAt }` (5 minutes, single use), since the browser tab has no MCP bearer token. The link is personal: before any provider, the browser signs in to wovain through AuthKit and must be the ticket's user, and an HttpOnly SameSite=Lax nonce cookie binds every flow to that browser (changed in review, see [verify.md](verify.md)).
   - `GET /connect/:provider` redeems the ticket in a transaction, creates `oauthFlows/{state}` `{ userId, provider, codeVerifier?, discoveryState?, expiresAt }` (10 minutes), runs `auth()` and answers 302 to the provider's consent page. A bad or used ticket gets a 400 page.
   - `GET /oauth/callback/:provider` loads and deletes the flow in a transaction, checks the provider, runs `auth()` with the code (the SDK checks `iss` against the stored discovery state), saves the encrypted tokens and shows "connected, go back to the chat". An `error` parameter or a failed exchange shows a "not connected" page, logging the error class only.
9. Proxy tools `fourthwall` and `fal` take `{ tool, arguments }`, where `tool` is an enum allowlist:
   - Fourthwall: `get-instructions`, `load-skills`, `read-skills`, `omni_knowledge`, `omni_search`, `ecommerce_get-current-shop`, `ecommerce_get-catalog-products`, `ecommerce_get-catalog-product-details`, `ecommerce_get-customization-pricing`, `ecommerce_generate-product-design-previews`, `ecommerce_request-media-upload-link`, `ecommerce_save-media-library-image`.
   - fal: `search_models`, `get_model_schema`, `get_pricing`, `estimate_cost`, `check_account_status`, `search_request_history`, `check_job`, `get_job_result`, `wait_for_jobs`.
   - Off the list: Fourthwall publish and pricing (`create-offers-from-designs`, `update-offer-status`, `bulk-update-offer-variant-prices`, refunds, orders) and fal generation (`run_model`, `submit_job`, `submit_jobs`). wovain calls fal generation itself (requirement 12). Fourthwall publishing stays on the host's Fourthwall MCP until chunk 5 moves it into the approve path.
   - The result is the upstream `content`, `structuredContent` and `isError`, with a note that upstream text is data. Upstream `_meta` (its UI) is dropped.
10. Expiry and refresh:
    - Before a call, a grant that expires within 60 seconds is refreshed under a lease: a transaction sets `leaseId` and `leaseUntil` (now + 20 s) when no live lease exists; the holder runs `auth()`, whose refresh path calls `saveTokens`, which writes the new ciphertext with `version + 1` and clears the lease. An instance that finds a live lease polls the doc for a higher `version` (up to 10 s) and uses those tokens.
    - A surprise 401 goes through the SDK's own refresh. If that fails with `invalid_grant` (another instance spent the rotating refresh token first), `invalidateCredentials("tokens")` deletes the doc only if its `version` is still the one this call loaded, so a fresh grant written by another instance survives. The call then re-reads once and retries with the newer tokens.
    - When no usable grant remains, the result is the connect link with `reconnect: true`.
11. Fourthwall's login-needed answer (HTTP 200, `isError: true`, `_meta["mcp/www_authenticate"]`) is treated like a revoked grant: the doc is deleted (version-checked) and the tool returns the reconnect link.
12. fal:
    - `generate_videos({ designId })` rebuilds the plan from the stored design and settings (the same `planVideos` as `video_plan`) and calls fal `submit_jobs` on the merchant's grant with exactly those clips. It returns the job handles for `fal` `wait_for_jobs`.
    - `add_video_audio({ designId, videoUrls })` runs the plan's audio request on each finished clip URL (`https` and a `fal.media` host only) with `submit_jobs`.
    - `video_spend`, `lib/fal-usage.ts`, its test, `FAL_BILLING_KEY` (env, `.env.example`, README, `infra/index.ts` secret list, the `apphosting.yaml` comment) are removed. The ads playbook asks the merchant's fal account through `fal` `search_request_history` instead. `FAL_KEY` stays for public list prices.
13. Playbooks: `instructions` says wovain connects Fourthwall and fal itself and that a `needsConnection` result means showing the link and waiting. The ads playbook uses `generate_videos`, `fal` `wait_for_jobs` and `add_video_audio`. The design playbook keeps the host Fourthwall MCP until chunk 5.
14. Nothing logs tokens, codes, ticket ids or upstream messages: errors are logged by class (`logErrorClass`).

## Design

### Checked and reused

- `@modelcontextprotocol/client` 2.3.1: `auth()` covers discovery, CIMD (`clientMetadataUrl` plus `client_id_metadata_document_supported`), PKCE, `state`, the `resource` indicator, code exchange, the `iss` check and refresh; `StreamableHTTPClientTransport({ authProvider })` adds the bearer and handles a 401; `Client.callTool` makes the call. Read in `dist/index.mjs` (`authInternal`): the callback leg requires the discovery state saved with the verifier, and `invalid_grant` calls `invalidateCredentials("tokens")` then retries, which ends in `redirectToAuthorization`.
- `@google-cloud/kms` `KeyManagementServiceClient.encrypt` and `decrypt` with `additionalAuthenticatedData`.
- `firebase-admin` transactions and `Timestamp` (TTL fields must be timestamps).
- `lib/tool-result.ts` (`text`, `notConfigured`, `logErrorClass`), `lib/video-plan.ts` (`planVideos`), `fal-pricing.ts` (prices).
- Not used: `@genkit-ai/mcp` (depends on the 1.x SDK), DCR (both providers support CIMD), envelope encryption (the payload is tiny), `rate-limiter-flexible` (a different chunk).

### Modules

- `lib/cipher.ts`: `Cipher { encrypt(plain, aad), decrypt(cipher, aad) }`, `kmsCipher(keyName)`, `localCipher(key?)`.
- `lib/connections.ts`: the provider table (`fourthwall`: `https://mcp.fourthwall.com/app`; `fal`: `https://mcp.fal.ai/mcp-relay`), the zod records, ticket and flow docs, and the version-checked connection reads and writes.
- `lib/oauth-client.ts`: `FirestoreOAuthProvider` (implements `OAuthClientProvider`) and the client metadata.
- `lib/upstream.ts`: `connectedCall(userId, provider, tool, args)`: freshness and lease, connect, call, the reconnect rules, close. Returns either the upstream result or a `needsConnection` value.
- `routes/connect.ts`: `/oauth/client.json`, `/connect/:provider`, `/oauth/callback/:provider`.
- `tools/connections.ts`: `fourthwall` and `fal`.
- `tools/ads.ts`: `generate_videos`, `add_video_audio`; `video_spend` removed.

## Areas of concern

- **Token theft at rest:** tokens are KMS-encrypted with the doc path as AAD; Firestore and Storage rules deny every client; the runner is the only principal with decrypt on the key.
- **Login CSRF and flow mix-ups:** `state` is a random flow id stored server-side and bound to the user and provider; tickets are single-use, short-lived and bound to the WorkOS `sub`. A callback for a different provider than the flow's is refused.
- **Confused spending:** generation inputs come from the stored plan, never from the agent. Publishing and pricing tools aren't proxied.
- **Prompt injection from upstream:** results are marked as data in the tool description and the result note.
- **Refresh races:** the lease plus version checks (requirement 10). A test runs two refreshes at once against a fake token endpoint that rotates.
- **Cost:** one KMS decrypt per proxied call ($0.03 per 10,000 operations, symmetric) and one key version ($0.06 a month).
