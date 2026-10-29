# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/59 (license scan moved to OSV-Scanner in https://github.com/sami-m-g/wovain/issues/103)

## Why

The repository is public and ships a product that holds merchants' provider tokens, but nothing scans its code, its dependencies, its licenses or its history for secrets, there is no disclosure policy, and a known high-severity advisory (`ip-address`) sits in the lockfile.

## What Changes

- SAST: CodeQL (`javascript-typescript`, `security-extended`) and Semgrep CE on pull requests, pushes to main and weekly, with SARIF in code scanning.
- Dependencies: OSV-Scanner (Google's reusable workflows) on both lockfiles, and `actions/dependency-review-action` on pull requests, failing on high severity.
- Licenses: dependency review enforces an allowlist of permissive licenses on what a pull request adds (MPL-2.0 is reported as a warning), and the `licenses` job runs OSV-Scanner's license scan on every package in both lockfiles, with license data from deps.dev and per-package exceptions, each with a reason, in `osv-scanner.toml`.
- SBOM: a CycloneDX SBOM attached to each GitHub Release.
- OpenSSF Scorecard on a schedule and on push to main, with a README badge.
- `SECURITY.md` pointing to GitHub private vulnerability reporting.
- `.gitguardian.yaml` and a `ggshield` job; the `GITGUARDIAN_API_KEY` Actions secret is declared in `infra/github.ts` from a stack secret.
- The main ruleset requires `codeql` and `dependency-review` besides `verify` and `infra` (code only: applied after the production freeze, 2026-11-16).
- `ip-address` is overridden to `^10.7.4` (the high advisory GHSA-mwp4-54f8-5fhr and five more).

## Capabilities

### New Capabilities

- `supply-chain-security`: the repository is scanned for code, dependency, license and secret problems before and after merge.

## Impact

- `.github/workflows/{codeql,osv,supply-chain,scorecard,sbom}.yml`, `osv-scanner.toml`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- `SECURITY.md`, `.gitguardian.yaml`, `README.md`
- `infra/github.ts`, `infra/index.ts`, `infra/README.md` (prod stack; do not apply before 2026-11-16)
