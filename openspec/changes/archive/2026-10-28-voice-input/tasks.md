# Tasks

## 1. Core

- [x] 1.1 `packages/core/src/voice.ts`:
  - transcriber on fal (primary, then fallback; data URI; `X-Fal-Store-IO: 0`)
  - intent schema, `resolveProposal`, the prompt, and the sealing helpers
  - tests first
- [x] 1.2 `voice_intent` agent in `agents.ts`: no scorers, PostHog privacy mode. `nemotron.ts` hides input and output in Mastra traces for private agents.
- [x] 1.3 `CoreConfig` gains `FAL_KEY`, `VOICE_STT_MODEL` and `VOICE_STT_FALLBACK_MODEL`; `core.voice` exposes the transcriber.

## 2. API

- [x] 2.1 `flow/voice.ts`:
  - `requireVoice`
  - `proposeVoiceCommand`, which builds the context on the server
  - `openVoiceProposal`, which opens a token for its own merchant only
  - tests first
- [x] 2.2 `routers/voice.ts` (`status`, `command`, `confirm`), registered on the app router. `confirm` runs the proposal through the button's own procedure (`runs.start`, `runs.approveIdeas`, `designs.approve/reject`, `approvals.decide`) with oRPC `call`. Analytics events carry no transcript.

## 3. Config

- [x] 3.1 `apps/web/.env.schema`: `FAL_KEY` (sensitive, optional), `VOICE_STT_MODEL` and `VOICE_STT_FALLBACK_MODEL` (dynamic, with local defaults). Add them to the Mastra Studio env.
- [x] 3.2 `infra/index.ts`:
  - `voiceSttModel` and `voiceSttFallbackModel` app settings
  - `fal-key` in the per-environment secrets
  - the keys added to `infra/Pulumi.prod.yaml` for prod, dev and next

## 4. Web

- [x] 4.1 `VoiceButton`: hold-to-talk with `MediaRecorder`, the disclosure, the confirm dialog, keyboard support. Mounted in the dashboard header.
- [x] 4.2 i18n messages (English plus each existing locale).

## 5. Verify

- [x] 5.1 `pnpm run check`, `check-types`, `knip`, `spec:validate`, and the core and api tests.
