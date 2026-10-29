# Spec Delta

## ADDED Requirements

### Requirement: Releases are versioned from conventional commits

A push to main SHALL keep one release pull request up to date with the next semantic version and the `CHANGELOG.md` entry computed from the conventional commits since the last release. Merging it SHALL tag the commit `v<version>` and publish a GitHub Release with the same notes.

#### Scenario: Feature merged

- **WHEN** a `feat:` commit lands on main
- **THEN** the release pull request proposes a minor bump with the commit under Features

#### Scenario: Release pull request merged

- **WHEN** the release pull request is merged
- **THEN** a `v<version>` tag and a GitHub Release exist, and the deploy workflow does not run for it

### Requirement: Releases are signed

Every GitHub Release SHALL carry, as assets, its source tarball, a keyless cosign bundle (`*.sigstore.json`) and a SLSA build provenance attestation (`*.intoto.jsonl`) made by the release workflow's OIDC identity. The images the deploy builds SHALL be signed with cosign by digest.

#### Scenario: Release published

- **WHEN** a release is published
- **THEN** `wovain-<tag>.tar.gz`, `wovain-<tag>.tar.gz.sigstore.json` and `wovain-<tag>.tar.gz.intoto.jsonl` are attached to it

### Requirement: History has releases

Every `v*` tag SHALL have a GitHub Release with notes from the conventional commits since the previous tag, and the same signed assets.

#### Scenario: Backfill

- **WHEN** the `backfill-releases` workflow runs on main with `dry_run` off
- **THEN** each tag from v0.1.0 to v0.31.0 has a signed GitHub Release, and the run can repeat without changing a release that exists
