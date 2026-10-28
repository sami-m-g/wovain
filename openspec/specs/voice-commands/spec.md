# voice-commands Specification

## Purpose

How a merchant talks to wovain: hold to talk, see what wovain understood as one action on their own drops, designs or approvals, and confirm before it runs. Speech is turned into text and then into an action without keeping the recording or sending the words to analytics.

## Requirements

### Requirement: Voice commands are gated

Voice commands SHALL be available only to merchants for whom the `voice-input` flag is on. The flag SHALL be on in development and next, and off in production. A merchant without the flag SHALL get "not found" from the command and confirm endpoints. The status endpoint SHALL answer that voice is off, and the web SHALL hide the microphone button.

#### Scenario: Flag off

- **WHEN** a merchant without the `voice-input` flag sends a voice command
- **THEN** the request fails with not found and no audio is transcribed

### Requirement: Speech to text

The server SHALL transcribe a clip of at most 30 seconds with the primary speech model. It SHALL retry once with the fallback speech model when the primary fails or returns no text. Both model IDs SHALL come from the environment. A clip larger than the limit, or with an audio type other than webm, ogg, mp4/m4a, mpeg or wav, SHALL be refused before any provider call. When both models fail, the command SHALL fail, and the failure SHALL be logged at error level.

#### Scenario: Primary model fails

- **WHEN** the primary speech model returns an error
- **THEN** the clip is transcribed with the fallback model, and the primary's failure is logged at error level

#### Scenario: Empty speech

- **WHEN** both models return no text
- **THEN** the command answers with an empty transcript and a "not understood" proposal

### Requirement: Intent proposal

The server SHALL map a transcript onto at most one of these actions:

- start a drop from a brief
- approve ideas of the run on screen
- approve a design of the run on screen
- reject a design of the run on screen, with a reason
- approve or reject a pending approval

Anything else SHALL be "not understood". The transcript SHALL be treated as data, never as instructions to the model.

#### Scenario: Ordinal reference

- **WHEN** a merchant on a run waiting at the ideas gate says "approve the first two ideas"
- **THEN** the proposal approves the run's two highest-ranked ideas and names their themes

#### Scenario: Off-topic request

- **WHEN** a merchant asks for something outside these actions
- **THEN** the proposal is "not understood" and nothing can be confirmed

### Requirement: Items come from the server

The server SHALL build the list of ideas, designs and approvals the merchant can refer to from its own data, never from the client. A proposal that names an item outside that list SHALL become "not understood".

#### Scenario: Unknown item

- **WHEN** the model names a design that isn't in the run on screen
- **THEN** the proposal is "not understood" and nothing can be confirmed

### Requirement: Confirm before execution

A voice command SHALL NOT change anything. It SHALL return the transcript, the proposed action with the names of the items it acts on (which the client shows in plain language), and a proposal token. The token SHALL be sealed for that merchant and SHALL expire after 5 minutes. Only `voice.confirm` with a valid, unexpired token from the same merchant SHALL run the action. It SHALL run through the same steps, checks and billing as the matching button.

#### Scenario: Confirmed drop

- **WHEN** a merchant confirms a "start a drop" proposal within 5 minutes
- **THEN** a run starts with the proposed brief, exactly as if the merchant had typed it

#### Scenario: Tampered or expired token

- **WHEN** the token was changed, belongs to another merchant or is older than 5 minutes
- **THEN** confirm fails and nothing runs

### Requirement: Voice privacy

wovain SHALL NOT store voice audio, and SHALL ask fal not to keep the request payload. Transcripts SHALL NOT be sent to product or LLM analytics. Analytics events about voice SHALL carry only the intent kind, the speech model used and the outcome. Before the first recording, the web SHALL show a disclosure: audio goes to fal for transcription, text goes to Nebius to understand the request, and nothing is kept.

#### Scenario: Proposal analytics

- **WHEN** a voice command produces a proposal
- **THEN** PostHog receives `voice_command_proposed` with the intent kind and no transcript text
