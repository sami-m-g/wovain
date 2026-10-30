# Tasks

## 1. Core

- [x] 1.1 `packages/core/src/ad-video.ts`: models config, Director concept and Reviewer verdict schemas and prompts, cast from Qloo buyers, fal inputs, SRT, output readers; tests
- [x] 1.2 Two agents, `ad_director` and `ad_video_review` (vision), in `packages/core/src/agents.ts`, the kit and the scorers

## 2. Billing and config

- [x] 2.1 `adVideo` credit step in the billing catalog and its fixture
- [x] 2.2 `FAL_AD_VIDEO_MODELS` in `apps/web/.env.schema`, `turbo.json`, the Mastra entry and `infra/settings.ts`; `falAdVideoModels` and `creditCost.adVideo` in `infra/next/Pulumi.next.yaml`

## 3. Workflow

- [x] 3.1 `flow/ad-video.ts`: evidence, held credits, keyed cast, film, finish, review, save, release; tests on PGlite with a fake fal and fake agents (one redo, no double charge, release on failure)
- [x] 3.2 `workflows/ad-video.ts`, registered on the Mastra instance and started from `product-videos` where it is on

## 4. Ads and app

- [x] 4.1 AI disclosure in the video ad's text on Meta
- [x] 4.2 Campaign step: cuts in their shape, AI-generated label
- [x] 4.3 Docs (en, es, fr), the FAQ and `docs/spec.md`

## 5. Verify

- [ ] 5.1 One real ad on next; record its URL and cost
