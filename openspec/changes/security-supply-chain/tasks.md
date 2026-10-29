# Tasks

Issue #59.

## 1. Scanning

- [x] 1.1 CodeQL and Semgrep workflow with SARIF upload
- [x] 1.2 OSV-Scanner reusable workflows for pull requests and a daily schedule
- [x] 1.3 Dependency review with `fail-on-severity: high` and a license allowlist
- [x] 1.4 License scan of both lockfiles in CI (OSV-Scanner), exceptions in `osv-scanner.toml`
- [x] 1.5 SBOM on releases
- [x] 1.6 OpenSSF Scorecard workflow and README badge
- [x] 1.7 `SECURITY.md`

## 2. Secrets

- [x] 2.1 `.gitguardian.yaml` and the `ggshield` job
- [x] 2.2 `GITGUARDIAN_API_KEY` declared in `infra/github.ts`, documented in `infra/README.md`

## 3. Branch protection

- [x] 3.1 `codeql` and `dependency-review` required on main (`infra/github.ts`)
- [ ] 3.2 Apply the `prod` stack after the production freeze (2026-11-16)
- [ ] 3.3 Set the `gitguardian-api-key` stack secret, then uninstall the GitGuardian GitHub App

## 4. Vulnerabilities

- [x] 4.1 Override `ip-address` to `^10.7.4`
- [x] 4.2 `deepmerge` 4.3.1 (GHSA-gcqx-w48m-w2h4, no patched version): pnpm patch, ignored in `osv-scanner.toml` until upstream releases a fix
- [x] 4.3 `@hono/node-server` 2.x for `@hono/node-ws` (GHSA-rmxm-3fg6-px4f), a pnpm override
- [x] 4.4 OSV-Scanner scans every lockfile in full on pull requests too; `osv / osv-scan` required on main
- [x] 4.5 Promo codes drawn with `crypto.randomInt` (CodeQL `js/biased-cryptographic-random`)

## 5. OpenSSF Scorecard

Issue #114.

- [x] 5.1 Dockerfile base images pinned by digest; corepack and varlock from `npm ci` lockfiles in `docker/`; Dependabot covers both
- [x] 5.2 Main ruleset: one approval, stale reviews dismissed, admin bypass on pull requests only
