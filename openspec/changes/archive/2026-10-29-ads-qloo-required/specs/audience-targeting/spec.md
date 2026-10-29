## MODIFIED Requirements

### Requirement: Failed steps are visible and left out

A step that fails (Qloo demographics, Qloo audiences or Meta interests) SHALL be logged at error level and marked failed in the decision trace and in the evidence. The targeting SHALL never contain a guessed value, and a targeting with a failed step or no Qloo audience SHALL NOT be staged (`qlooAudienceGap`).

#### Scenario: Meta search fails

- **WHEN** Meta's interest search answers an error
- **THEN** the evidence lists `meta.interests` as failed, the failure reaches error tracking, and no campaign is staged with that targeting

## REMOVED Requirements

### Requirement: Targeting preview

**Reason**: The preview was gated by the `qloo-audiences` flag, which is removed; the ungated preview replaces it. **Migration**: Use "Targeting preview for every merchant".

## ADDED Requirements

### Requirement: Targeting preview for every merchant

`targeting.preview({ countries })` SHALL return the Meta targeting, the persona and the evidence for the signed-in merchant's brand, with no flag, and SHALL save its steps as a decision trace.

#### Scenario: Preview

- **WHEN** a signed-in merchant asks for a preview for the US
- **THEN** the answer carries the targeting, the persona and the evidence, and the steps are saved as a decision trace
