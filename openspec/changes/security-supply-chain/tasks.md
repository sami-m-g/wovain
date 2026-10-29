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

- [x] 2.1 `.gitguardian.yaml`; the `ggshield` job is removed: the GitGuardian GitHub App is the one secret scan
- [x] 2.2 `GITGUARDIAN_API_KEY` (`incidents:write`) declared in `infra/github.ts` for the `gitguardian-ignore` workflow, documented in `infra/README.md`

## 3. Branch protection

- [x] 3.1 `codeql` and `dependency-review` required on main (`infra/github.ts`)
- [ ] 3.2 Apply the `prod` stack after the production freeze (2026-11-16)
- [ ] 3.3 Set the `gitguardian-api-key` stack secret; it reaches the repository with 3.2

## 4. Vulnerabilities

- [x] 4.1 Override `ip-address` to `^10.7.4`
- [ ] 4.2 `deepmerge` 4.3.1 (low, no patched version) stays until upstream releases one
