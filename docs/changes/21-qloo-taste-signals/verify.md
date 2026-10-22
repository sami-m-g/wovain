# Verify: Qloo taste signals drive trend research and Meta targeting

## Tests added

- `apps/server/test/unit/taste.test.ts`:
  - Requests go to `https://hackathon.api.qloo.com` with `X-Api-Key`.
  - The taste graph keeps tag IDs only, sorts them by affinity and takes the last velocity. A failed trending call only drops velocity, and the seed never reaches the logs.
  - The score formula, including the hype discount and the ad boost.
  - Ideas are scored and sorted in code, with `taste`, `moment`, competitors and a price taken from the snippet.
  - A re-run with `adCounts` re-scores without new Tavily or Qloo calls.
  - Nemotron writes copy but can't change the order, and copy that names a Qloo entity is dropped.
  - `not_configured`, `failed` and `no_match` fall back to the news path. Themes with no hits drop out before any model call.
  - Audience parsing, and bounded inputs.
- `apps/server/test/integration/research-tools.test.ts`:
  - `suggest_audience` without a key, with a fake Qloo, and after a Qloo failure (the error reaches the user safely).
  - `research_trends` with Qloo over MCP, and its `qloo: "not_configured"` without a key.
- `apps/server/test/live/qloo.test.ts`: one real taste and audience lookup (5 Qloo calls, no Tavily credits). It skips without `QLOO_API_KEY`.
- `apps/server/test/helpers.ts`: `fakeQloo` and the `qlooTaste` fixture.

## Checks run

All of these passed after rebasing on `main` (the #19 connections merge):

- `pnpm check`
- `pnpm typecheck`
- `pnpm knip`
- `pnpm arch`
- `pnpm dupes` (0 clones)
- `pnpm test` (99 tests)
- `pnpm test:integration` (85 tests)
- `pnpm build`

`pnpm test:live` skipped all 3 files: there are no keys in this worktree.

## Review findings

`/simplify` ran four reviewers.

- **Reuse.** Fixed:
  - The tag regex is now shared as `isQlooTag`.
  - The age, gender and point schemas are shared between parsing and output.
  - `promptHit` and `ranked` are shared by the news path and the taste path.

  Skipped: rewording `AUDIENCE_NOTE` to reuse `UNTRUSTED`, because `UNTRUSTED` talks about web results and Qloo data isn't from the web.

- **Simplification.** Fixed:
  - Dropped the `ranker: "qloo"` value, which duplicated `qloo: "used"`.
  - Deleted the unused `AudienceInput` type.

  Kept:
  - `taste`, because the owner asked for each idea to show "taste: …".
  - `tags` as an array, so it can take more than one tag later.
  - The `id`/`tag_id` fallbacks, until a real key confirms which one Qloo sends.

- **Efficiency.** Fixed:
  - No model call when no theme has hits.
  - Avoid-names are lowercased once.
  - A re-run with `adCounts` re-scores the cached searches: 15 minutes, up to 50 seeds per instance.
- **Altitude.** Fixed:
  - `createTrendResearch(client, { ai, model, qloo })` takes an options object.
  - `ranker` is back to describing the news path only.

  Skipped: a discriminated union for Qloo ideas against news ideas, which would complicate the MCP output schema for little gain.

I checked silent failures myself, because the `pr-review-toolkit` agents aren't installed in this session:

- Every Qloo or model failure is logged by class and reported as `qloo: "failed"`, as a missing `velocity`, or as theme-name copy.
- Ad counts whose theme matches no idea are ignored. They show up as no `activeAds` in that idea's `signals`.

## Try it

1. Put the hackathon key in `apps/server/.env` as `QLOO_API_KEY`, next to `TAVILY_API_KEY`.
2. Run `pnpm test:live` (5 Qloo calls) to confirm the host and the response shapes.
3. Run `pnpm dev`, then ask the agent "what should I sell to synthwave fans?". Each idea shows taste, moment, score and competitors, and the result has `qloo: "used"`.
4. Pick an idea and start the campaign. The playbook calls `suggest_audience` with the idea's tags.
5. In production, run `pulumi config set --secret qloo-api-key` in `infra/`, then add `QLOO_API_KEY` (secret `qloo-api-key`) to `apphosting.yaml`. App Hosting won't build with an empty secret, so this MR doesn't list it yet.

## Departures from the plan

- The Qloo path lives in `lib/taste.ts`, not `lib/trends.ts`, to keep both files small. `UNTRUSTED`, `sourceOf` and `promptHit` moved to `lib/tavily.ts` to avoid an import cycle.
- Added a 15-minute re-score cache so the Ad Library step costs no extra credits.
- The campaign step names the top places in its summary but keeps the country targeting, so the plan's country rule still holds.
- Unit tests live in `taste.test.ts`, not a separate `qloo.test.ts`.
