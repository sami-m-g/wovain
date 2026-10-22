# Plan: connect Meta through wovain

Spec: [spec.md](spec.md)

The plan checkpoint was waived: the owner approved building this.

## Files that change

- `apps/server/src/lib/connections.ts`: the `meta` provider and its scope.
- `apps/server/src/lib/oauth-client.ts`: static client information.
- `apps/server/src/lib/upstream.ts`: per-provider clients, `configured`, `accessToken`, and the scope on `auth()`.
- `apps/server/src/lib/meta-graph.ts`: `appsecret_proof`.
- `apps/server/src/tools/connections.ts`: `meta_ads`, `disconnect`.
- `apps/server/src/tools/campaign.ts`: `campaign_draft`, `launch_campaign`, and `create_rules` on the merchant's grant.
- `apps/server/src/playbooks/campaign.ts`, `playbooks/index.ts`: wovain's Meta path, with the host-MCP fallback.
- `apps/server/src/routes/pages.ts` (new) and `app.ts`: `/privacy`, `/data-deletion`.
- `apps/server/src/env.ts`, `runtime.ts`, `server.ts`, `.env.example`, `apphosting.yaml`, `infra/index.ts`: the Meta app keys come in and `META_SYSTEM_USER_TOKEN` goes.
- Tests: `test/fake-upstream.ts` (a Meta-style authorization server without CIMD), `test/integration/upstream.test.ts`, `test/integration/campaign-tools.test.ts`, `test/integration/app.test.ts`.
- Docs: `docs/spec.md`, README, `verify.md`.

## Order of work

1. This plan.
2. Provider, client, upstream, tests.
3. Tools and playbook, tests.
4. Pages, env and infra.
5. Checks, review, `verify.md`, MR.

## Risks

- Graph may refuse the MCP grant on `adrules_library`. Then the rules fail with Meta's reason and the widget shows them as not created. A tester checks this after merge.
- Meta's MCP may rename tools. The allowlists are enums, so a rename fails loudly.
- `launch_campaign` is callable by the model, as `ads_activate_entity` was through the host. The playbook gates it on the widget's Launch message.

## Tests that prove it

- A Meta-style fake (no CIMD, no DCR) connects with the static client ID and the narrowed scope, then runs a tool.
- Without the Meta app configured, `meta_ads` answers `configured: false`.
- `campaign_draft` overwrites the budget and sets `hide_ui`. `launch_campaign` publishes the saved campaign only.
- `create_rules` sends the merchant's token and `appsecret_proof` to Graph, and returns the connect link without a grant.
- `/privacy` and `/data-deletion` answer 200.
