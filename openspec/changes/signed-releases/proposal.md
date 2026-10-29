# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/188

## Why

The repository has no releases on GitHub: release-please was dropped when CI moved to GitLab and never came back, and the 28 `v0.x` tags from that time have no release page, notes or signatures. OpenSSF Scorecard scores Signed-Releases at 0, and the project cannot answer the OpenSSF Best Practices (passing) release questions.

## What Changes

- release-please (`release.yml`, `release-please-config.json`, `.release-please-manifest.json`) keeps one release pull request up to date from conventional commits, with `CHANGELOG.md`, and on merge tags the commit and publishes a GitHub Release.
- Every release is signed (`sign-release.yml`): the source tarball gets a keyless cosign bundle (`*.sigstore.json`) and a SLSA build provenance attestation (`*.intoto.jsonl`) as release assets. The container images the deploy builds are signed with cosign by digest.
- History is released retroactively (`backfill-releases.yml`, run once by hand): GitHub Releases for the existing tags v0.1.0 to v0.28.0 and three milestones (v0.29.0 Basics submission, v0.30.0 Transcend submission, v0.31.0 move to GitHub), notes written by git-cliff from the conventional commits, each signed. `CHANGELOG.md` carries the same history; release-please continues from v0.31.0.
- `CONTRIBUTING.md` documents how to contribute, the commit format, the test policy and the review rule.

## Capabilities

### New Capabilities

- `release-integrity`: releases are versioned from conventional commits, have notes, and are signed.

## Impact

- `.github/workflows/{release,sign-release,backfill-releases,deploy}.yml`
- `release-please-config.json`, `.release-please-manifest.json`, `version.txt`, `CHANGELOG.md`, `.config/cliff.toml`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- `CONTRIBUTING.md`, `SECURITY.md`
