# Spec Delta

## Purpose

The wovain logo (the Shuttle), its variants, icons and motion, and the one place every surface reads it from.

## ADDED Requirements

### Requirement: Single swappable logo

Every surface SHALL render the logo through `<Logo/>`, `ShuttleMark` or `ShuttleLoader`, reading files from `apps/web/public/brand/` and geometry from `src/brand/brand.tsx`, so the artwork changes in one place.

#### Scenario: Logo swap

- **WHEN** the brand files in `public/brand/` and `BRAND_ASSETS` are replaced
- **THEN** the header, footer, auth, app rail, OG card, docs and emails show the new logo without component changes

### Requirement: Icons by file convention

The web and docs apps SHALL ship the favicon, app icon and social image through Next.js metadata files (`icon.svg`, `favicon.ico`, `icon.png`, `apple-icon.png`, `opengraph-image`), and the manifest SHALL list a maskable icon.

#### Scenario: Small sizes

- **WHEN** the favicon is shown at 16px
- **THEN** it uses the pixel-fitted 16px drawing, and 32px and up use the 32px-tuned drawing

### Requirement: Motion respects reduced motion

The logo intro and the mark loader SHALL play only when motion is allowed. With `prefers-reduced-motion: reduce`, the intro SHALL become a short fade and the loader a slow opacity pulse, with no travel.

#### Scenario: Reduced motion

- **WHEN** a visitor with reduced motion opens a page with `<Logo intro/>` or a `ShuttleLoader`
- **THEN** the shuttle does not move along its axis

### Requirement: Accessible loading state

`ShuttleLoader` SHALL announce its label as a status, and a decorative `ShuttleMark` SHALL be hidden from assistive technology.

#### Scenario: Loading

- **WHEN** a dashboard route is loading
- **THEN** screen readers hear the loading label once
