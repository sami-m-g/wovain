# Spec Delta

## ADDED Requirements

### Requirement: Product variants

With the `design-drops` flag on, a design's placement preview and its product SHALL be made in the brief's garment colors that match the blank's colors (up to 4, or the blank's first color when none matches) and in every size the blank comes in, spelled as Fourthwall lists them.

#### Scenario: Colors and sizes passed

- **WHEN** the brief lists "black" and the blank comes in White, Black and Sand Dune, sizes S to 2XL
- **THEN** the preview asks Fourthwall for Black in S, M, L and 2XL
