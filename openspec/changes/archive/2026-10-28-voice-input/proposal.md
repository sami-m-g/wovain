# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/82 (this change delivers part of it)

Follow-ups:

- Mobile hold-to-talk component (`add-mobile-voice`): https://github.com/sami-m-g/wovain/issues/88
- Voice intents for suggestions: https://github.com/sami-m-g/wovain/issues/89
- Server-side voice consent (`voiceConsentAt`): https://github.com/sami-m-g/wovain/issues/90

## Why

Indie designers run wovain from their phone between other work, where typing a brief or tapping through approvals is slow. The founder chose voice input over a chat buddy. The merchant holds a button and says what they want ("make a drop for 90s anime fans", "approve the first two ideas", "reject this one, the text is too small"). They check what wovain understood, then confirm. Voice is first-class on mobile and secondary on the web.

## What Changes

- New `voice.status`, `voice.command` and `voice.confirm` procedures behind the `voice-input` flag. The flag is on in development and next and off in production.
- `voice.command` takes a short audio clip (base64, at most 30 seconds) and the screen the merchant is on. It transcribes the clip with NVIDIA Nemotron ASR on fal, and falls back to `fal-ai/wizper` when Nemotron fails. A Nemotron agent on Nebius Token Factory then maps the transcript onto one existing action. The procedure returns the transcript, the proposed action with the names of the items it acts on, and a sealed proposal token. Nothing runs yet.
- `voice.command` is rate limited per merchant (6 a minute, 60 an hour) and refuses a clip longer than 30 s at the client bitrate.
- `voice.confirm` runs a token at most once, then opens the token and runs the action through the same flow functions the buttons use: start a drop, approve ideas at the ideas gate, approve or reject a design, or approve or reject a queued approval.
- The speech model IDs are env vars (`VOICE_STT_MODEL`, `VOICE_STT_FALLBACK_MODEL`) set from Pulumi config. wovain pays for transcription with its own fal key (`FAL_KEY`, from the existing `fal-key` secret, now held per environment). The merchant's fal account is never charged for it.
- Privacy:
  - wovain never writes the audio anywhere, and sends it to fal with payload storage off.
  - Transcripts never reach analytics. The intent agent's PostHog LLM events use privacy mode, and its Mastra trace hides input and output.
  - PostHog gets only the intent kind and the outcome.
- Web: a hold-to-talk button in the dashboard header, with a one-time disclosure and a confirm dialog.

## Capabilities

### New Capabilities

- `voice-commands`: hold-to-talk speech becomes an action proposal that the merchant confirms.

### Modified Capabilities

None.

## Impact

- `packages/core`:
  - `voice.ts`: transcriber, intent schema, proposal resolution and sealing.
  - `agents.ts`: a `voice_intent` agent with no scorers and privacy-mode analytics.
  - `nemotron.ts`: hides input and output in the traces of private agents.
  - `core.ts`: `CoreConfig` gains the voice env vars.
- `packages/api`: `flow/voice.ts`, `routers/voice.ts` and the app router.
- `apps/web`: `.env.schema`, a `VoiceButton` in the dashboard header, and i18n messages.
- `infra`:
  - `voiceSttModel` and `voiceSttFallbackModel` app settings per environment.
  - `fal-key` as a per-environment secret.
- Dependencies:
  - This change stacks on the foundation PR (#60) for the flag, the approval queue and the model router.
  - The mobile hold-to-talk component waits for the mobile app branch, which isn't open yet (#88).
- `packages/db`: a `voice_command` table (rate limit and single-use tokens).
