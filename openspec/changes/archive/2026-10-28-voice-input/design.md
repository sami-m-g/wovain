# Design

## Context

- The run workflow already has the gates a merchant decides at: the ideas gate and the design approval gate. The foundation PR (#60) adds one approval queue.
- `runs.start`, `runs.approveIdeas`, `designs.approve/reject` and `approvals.decide` are the actions a merchant takes by tapping. Voice reuses them.
- The research (mobile-voice scoping, 2026-10-28) picked NVIDIA Nemotron ASR on fal for speech to text, with Wizper as the fallback. Nebius Token Factory lists text, embedding and vision models only, so it can't transcribe today. The intent step runs on Nemotron through Token Factory.

## Goals / Non-Goals

**Goals:**

- One server path for every client (web now, mobile next): audio in, proposal out, confirm to run.
- Nothing runs on a single utterance.
- No stored audio, and no transcript in analytics.

**Non-Goals:**

- Streaming partial transcripts, spoken replies (TTS), multi-turn chat.
- Voice consent stored on the user row: it would need a migration. The web keeps the acknowledgement in local storage for now.
- Per-user rate limits beyond the 30-second clip cap and sign-in.

## Decisions

### Speech to text over fal's REST API, with wovain's own key

- `createTranscriber` in `packages/core/src/voice.ts` POSTs to `https://fal.run/<model>` with:
  - `audio_url` as a `data:` URI, so the audio never goes through fal storage or the CDN
  - the header `X-Fal-Store-IO: 0`, so fal keeps no request payload
- The two models answer differently: Nemotron returns `output`, Wizper returns `text`. Both are read.
- We call one documented endpoint with `fetch`. The `@fal-ai/client` SDK isn't added: its upload helpers are the part we must avoid.
- wovain's key is used because voice is a platform feature. The merchant's fal grant (MCP) pays for art only.
- Model IDs: `VOICE_STT_MODEL=nvidia/nemotron-asr-multilingual/asr` and `VOICE_STT_FALLBACK_MODEL=fal-ai/wizper`, set from Pulumi config.

### A dedicated `voice_intent` Mastra agent

- The agent is added to `AGENT_IDS`. It has no scorers, so no transcript reaches the judges or PostHog scores, and no memory.
- It is listed in a new `PRIVATE` set:
  - `tracedModel` sets `posthogPrivacyMode`, so `$ai_generation` carries no input or output.
  - `nemotron.ts` sets Mastra's `tracingOptions.hideInput/hideOutput`.
- Output is a zod discriminated union:
  - `start_drop {brief}`
  - `approve_ideas {ideaIds}`
  - `approve_design {designId}`
  - `reject_design {designId, reason?}`
  - `decide_approval {approvalId, approve, note?}`
  - `none {reason}`
- The prompt lists the items on screen, numbered and labelled (an idea's theme, a design's title, an approval's title). "The first one" therefore resolves without the client. The transcript sits in a quoted block marked as data.
- Model routing: the agent uses the kit's default model, like every agent today. The model-routing PR (#74) can map it to the `fast` role.

### Context built on the server

- The client sends `{screen, runId?}` only.
- The server loads the run's ideas and its designs that are pending approval, plus the merchant's pending approvals when `autonomy-approvals` is on.
- `resolveProposal` drops any ID the model invents, so the client can't point voice at someone else's rows. The flow functions check ownership again anyway.

### Sealed proposal, no new table

- The proposal `{userId, intent, expiresAt}` is sealed with the existing AES-256-GCM sealer (`TOKEN_ENCRYPTION_KEY`). The context string is `voice:<userId>`, so a token from another merchant doesn't open.
- Confirm opens the token, checks the expiry (5 minutes) and runs the action. It calls the button's own oRPC procedure with oRPC's `call`, so input validation, credits, funnel events and typed errors are the same as a tap (the pattern the MCP server already uses with its router client).
- No migration is needed. A proposal could be replayed within its 5 minutes, which is harmless: every action is idempotent or refused on a second try (the gates move on, an approval is no longer pending).
- Alternative considered: enqueue the proposal in the approval queue with `proposedBy: "voice"`. Rejected because:
  - the policy would auto-approve R1 actions at the `draft` level, which skips the merchant's confirmation
  - there is no executor for `autopilot.run.start` yet

### Analytics

- `voice_command_proposed {intent, model, fallback}` and `voice_command_confirmed {intent}` go to PostHog, with no text.
- Confirmed actions also send their usual funnel event (`run_started`, `design_approved`) with `via: "voice"`.

### Web UI

- `VoiceButton` sits in the dashboard header and renders only when `voice.status` says it's on.
- Pointer down starts a `MediaRecorder`; pointer up (or 30 s) stops it. Keyboard: Space or Enter toggles recording.
- The first use shows the disclosure dialog. The result shows in a dialog with the transcript, the action in plain words (from i18n messages) and Confirm / Close.
- The screen comes from the path: `/dashboard/new?run=` gives `run` with `runId`, and `/dashboard/new` gives `new_drop`. Any other path gives `home`, and starting a drop still works there.

## Risks / Trade-offs

- [Nemotron ASR accuracy on fashion jargon] → The fallback covers outright failures only. The confirm step shows the transcript, so a mishearing is caught before anything runs.
- [fal sync endpoint latency, up to a few seconds] → Acceptable for hold-to-talk. The button shows a busy state.
- [Data URIs inflate the request (about 1.33×)] → A 30 s Opus clip is about 120 KB, and the cap is 1.5 MB of base64.
- [Mobile app not started] → The API is client-agnostic. The mobile component is a follow-up on the mobile branch.

## Migration Plan

- No database migration.
- Before the first demo on next.wovain.com, set the Pulumi config keys `voiceSttModel-next` and `voiceSttFallbackModel-next` (already in `Pulumi.prod.yaml`) and the secret `fal-key-next`.
- Rollback: turn the `voice-input` flag off.
