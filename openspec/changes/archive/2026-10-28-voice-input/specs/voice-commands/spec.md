## ADDED Requirements

### Requirement: Voice commands are gated

Voice commands SHALL be available only to merchants for whom the `voice-input` flag is on. The flag SHALL be on in development and next, and off in production. A merchant without the flag SHALL get "not found" from the command and confirm endpoints. The status endpoint SHALL answer that voice is off, and the web SHALL hide the microphone button.

#### Scenario: Flag off

- **WHEN** a merchant without the `voice-input` flag sends a voice command
- **THEN** the request fails with not found and no audio is transcribed

### Requirement: Speech to text

The server SHALL transcribe a clip with the primary speech model. It SHALL retry once with the fallback speech model when the primary fails or returns no text. Both model IDs SHALL come from the environment. When both models fail, the command SHALL fail, and the failure SHALL be logged at error level.

#### Scenario: Primary model fails

- **WHEN** the primary speech model returns an error
- **THEN** the clip is transcribed with the fallback model, and the primary's failure is logged at error level

#### Scenario: Empty speech

- **WHEN** both models return no text
- **THEN** the command answers with an empty transcript and a "not heard" proposal

### Requirement: Fallback detects the language

The fallback speech model SHALL detect the spoken language instead of assuming English, as the primary model does.

#### Scenario: Fallback on a Spanish command

- **WHEN** the primary fails on a command spoken in Spanish
- **THEN** the fallback request asks the model to detect the language, so the command isn't decoded as English

### Requirement: Clip limits

A clip SHALL be at most 30 seconds. Clients SHALL record at no more than 64 kbit/s. The server SHALL refuse a clip larger than 30 seconds at 64 kbit/s plus container room, or with an audio type other than webm, ogg, mp4/m4a, mpeg or wav, before any provider call.

#### Scenario: Oversized clip

- **WHEN** a client sends a clip larger than the size cap
- **THEN** the command fails validation and no provider is called

### Requirement: Voice rate limit

The server SHALL allow each merchant at most 6 voice commands a minute and 60 an hour, counted in Postgres so every instance shares the count. A command past the limit SHALL fail with "too many requests" before any provider call.

#### Scenario: Seventh command in a minute

- **WHEN** a merchant sends a seventh voice command within a minute
- **THEN** the command fails with too many requests and no audio is transcribed

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

### Requirement: Nothing to confirm is localized

A proposal with nothing to confirm SHALL carry a code, `not_heard` or `not_understood`, that the client shows in the merchant's language. It MAY carry the model's own short reply, which the client shows only as an extra.

#### Scenario: Spanish merchant not understood

- **WHEN** a merchant using the Spanish interface says something wovain can't act on
- **THEN** the dialog explains it in Spanish from the `not_understood` code

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

### Requirement: A token is confirmed once

The server SHALL record a token's command as confirmed, atomically, before the action runs. It SHALL refuse a token already confirmed with a conflict.

#### Scenario: Replayed token

- **WHEN** a merchant confirms the same token twice (a retry, a second tab or a resent request)
- **THEN** the first confirm runs the action, the second fails with a conflict, and no second run starts or spends credits

### Requirement: Voice privacy

wovain SHALL NOT store voice audio, and SHALL ask fal not to keep the request payload. Transcripts SHALL NOT be sent to product or LLM analytics. Analytics events about voice SHALL carry only the intent kind, the speech model used and the outcome.

#### Scenario: Proposal analytics

- **WHEN** a voice command produces a proposal
- **THEN** PostHog receives `voice_command_proposed` with the intent kind and no transcript text

### Requirement: Voice disclosure

Before the first recording, the web SHALL show a disclosure: wovain doesn't store the recording, audio goes to fal for transcription, and text goes to Nebius to understand the request. The disclosure SHALL NOT promise retention terms of fal or Nebius that wovain hasn't confirmed.

#### Scenario: First use

- **WHEN** a merchant presses the microphone for the first time
- **THEN** the disclosure shows before anything is recorded, and it doesn't claim that fal keeps nothing
