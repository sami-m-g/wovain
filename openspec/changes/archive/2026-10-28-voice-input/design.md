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
- Voice consent stored on the user row (#90). The web keeps the acknowledgement in local storage for now.
- The mobile hold-to-talk component (#88) and suggestion intents (#89).

## Decisions

### Speech to text over fal's REST API, with wovain's own key

- `createTranscriber` in `packages/core/src/voice.ts` POSTs to `https://fal.run/<model>` with:
  - `audio_url` as a `data:` URI, so the audio never goes through fal storage or the CDN
  - the header `X-Fal-Store-IO: 0`, so fal keeps no request payload
- The two models answer differently: Nemotron returns `output`, Wizper returns `text`. Both are read.
- We call one documented endpoint with `fetch`. The `@fal-ai/client` SDK isn't added: its upload helpers are the part we must avoid.
- wovain's key is used because voice is a platform feature. The merchant's fal grant (MCP) pays for art only.
- Model IDs: `VOICE_STT_MODEL=nvidia/nemotron-asr-multilingual/asr` and `VOICE_STT_FALLBACK_MODEL=fal-ai/wizper`, set from Pulumi config.
- Wizper's `language` defaults to `"en"`. The fallback request sends `language: null`, so Whisper detects the language as Nemotron ASR does, and a Spanish or French command isn't decoded as English.

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
  - `none {code, reason?}`: `code` is `not_heard` or `not_understood`, which the client translates; `reason` is the model's own reply, shown as an extra.
- The prompt lists the items on screen, numbered and labelled (an idea's theme, a design's title, an approval's title). "The first one" therefore resolves without the client. The transcript sits in a quoted block marked as data.
- Model routing: the agent uses the kit's default model, like every agent today. The model-routing PR (#74) can map it to the `fast` role.

### Context built on the server

- The client sends `{screen, runId?}` only.
- The server loads the run's ideas and its designs that are pending approval, plus the merchant's pending approvals when `autonomy-approvals` is on.
- `resolveProposal` drops any ID the model invents, so the client can't point voice at someone else's rows. The flow functions check ownership again anyway.

### Sealed proposal, confirmed once

- The proposal `{jti, intent, expiresAt}` is sealed with the existing AES-256-GCM sealer (`TOKEN_ENCRYPTION_KEY`). The context string is `voice:<userId>`, so a token from another merchant doesn't open.
- Confirm opens the token, checks the expiry (5 minutes) and runs the action. It calls the button's own oRPC procedure with oRPC's `call`, so input validation, credits, funnel events and typed errors are the same as a tap (the pattern the MCP server already uses with its router client).
- A token is confirmed at most once. `voice_command` holds one row per command (who and when, no audio or words), and its id is the token's `jti`. Confirm runs `UPDATE voice_command SET confirmed_at = now() WHERE id = jti AND user_id = me AND confirmed_at IS NULL RETURNING id` before the action. A retry, a second tab or a resent request finds no row and gets 409, so a `start_drop` can't start a second run or spend credits twice. The mark stays if the action then fails; the merchant says the command again.

### Rate limit and clip size

- `voice.command` claims a `voice_command` row before any paid call, under a per-merchant advisory lock (the promo redeem limit's pattern). Past 6 a minute or 60 an hour it fails with 429. Rows older than an hour are deleted on the merchant's next command.
- Clients record at 48 kbit/s. The server caps the clip at 30 s at 64 kbit/s plus 10% container room (264 KB, about 352 K base64 characters), so a longer clip at the client's bitrate is refused. Reading the duration from the container isn't reliable for Chrome's WebM, which carries none; a clip recorded far below the bitrate is bounded by the rate limit instead.
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
- [Data URIs inflate the request (about 1.33×)] → A 30 s clip at 48 kbit/s is about 180 KB, and the cap is about 352 K base64 characters.
- [fal's retention terms aren't confirmed] → The copy says only what wovain controls: wovain doesn't store the recording. It doesn't promise that fal keeps nothing.
- [Mobile app not started] → The API is client-agnostic. The mobile component is a follow-up on the mobile branch.

## Migration Plan

- One migration adds `voice_command` (`pnpm run db:generate`).
- Before the first demo on next.wovain.com, set the Pulumi config keys `voiceSttModel-next` and `voiceSttFallbackModel-next` (already in `Pulumi.prod.yaml`) and the secret `fal-key-next`.
- Rollback: turn the `voice-input` flag off.
