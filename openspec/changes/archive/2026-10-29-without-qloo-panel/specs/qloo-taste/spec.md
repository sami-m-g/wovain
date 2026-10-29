## MODIFIED Requirements

### Requirement: Offline Qloo ablation

No product path SHALL run without Qloo. An offline eval SHALL research the same seeds with Qloo's themes and with themes a model splits from the brief alone (an eval-only arm), and SHALL report, for each arm, the share of themes grounded in a Qloo tag, the share of ideas explained by Qloo entities, the number of aesthetic cues, and how far the themes move from the seed's own words. Its report SHALL be committed, and SHALL record for each seed the cross-domain calls Qloo refused.

#### Scenario: Qloo fails during the eval

- **WHEN** the Qloo search or theme call fails for a seed during the eval
- **THEN** the eval fails instead of reporting a with-Qloo arm without themes

#### Scenario: Qloo refuses a domain's affinities

- **WHEN** a brand, film or TV affinity call fails for a seed, as when Qloo refuses the seed's entities as signals
- **THEN** the seed's report lists that domain under `failedDomains`, the seed has no affinities from it, and the eval goes on

#### Scenario: Eval without keys

- **WHEN** the eval runs without `QLOO_API_KEY` or `NEBIUS_API_KEY`
- **THEN** the suite is skipped

## ADDED Requirements

### Requirement: Without Qloo beside the ideas

The ideas step SHALL show, under the ideas, a greyed "Without Qloo" panel read from the committed ablation report: for the with-Qloo and the model-only arm, the share of themes grounded in a Qloo tag, the share Qloo explains, the taste domains and the style cues, and each seed's themes side by side, with the run's date and model. The panel SHALL make no call.

#### Scenario: Ideas are ready

- **WHEN** the ideas step shows a run's ideas
- **THEN** the "Without Qloo" panel shows both arms' figures from the committed report, and the seeds' themes on request

#### Scenario: Qloo found no taste for a seed

- **WHEN** a seed's with-Qloo themes are empty in the report
- **THEN** its row says no taste was found instead of an empty cell
