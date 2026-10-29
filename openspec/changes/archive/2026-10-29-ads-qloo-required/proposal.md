# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/151

## Why

Every idea is a Qloo taste tag, so every ad should reach Qloo's audience for that idea's brand. Campaign staging still ran without Qloo: with the `qloo-audiences` flag off it skipped targeting, and when a Qloo or Meta targeting step failed it staged a countries-only ("broad") ad set. Broad ads spend the merchant's money on people the taste graph never picked.

## What Changes

- No Qloo audience, no campaign. `campaigns.create` refuses with `QLOO_AUDIENCE_MISSING` (422) and stages nothing on Meta when a targeting step failed (`reason: "failed"`, retry) or Qloo kept no audience for the brand (`reason: "no_audience"`, add a brand Qloo knows). The drop flow shows the message and the fix; the campaign button is the retry.
- The refusal is thrown inside the keyed audience write, so nothing is saved and a retry asks Qloo again.
- The ad set always carries Qloo's targeting; the "broad" ad set is gone.
- The `qloo-audiences` flag is removed (flag cleanup rule): its code paths, registry entry and PostHog flag.
- `targeting.preview` is no longer gated.

## Impact

- `packages/core/src/targeting.ts` (`qlooAudienceGap`), `packages/core/src/ads.ts`
- `packages/api/src/flow/audiences.ts`, `packages/api/src/flow/campaigns.ts`, `packages/api/src/routers/{seller,audiences}.ts`
- `apps/web/src/lib/flow-client.ts`
- `packages/core/src/flag-registry.ts`, `infra/posthog/flags.json`
