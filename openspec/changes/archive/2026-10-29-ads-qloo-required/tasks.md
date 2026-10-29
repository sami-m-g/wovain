# Tasks

Issue #151.

## 1. Qloo required

- [x] 1.1 `qlooAudienceGap` in `@wovain/core/targeting`: a failed step or no Qloo audience
- [x] 1.2 `campaigns.create` refuses with `QLOO_AUDIENCE_MISSING` inside the keyed audience write; the ad set always carries Qloo's targeting
- [x] 1.3 The drop flow shows the refusal and its fix
- [x] 1.4 Remove the `qloo-audiences` flag, its gate and its PostHog flag
- [x] 1.5 Tests: refusal, retry after Qloo recovers, brand with no audience
