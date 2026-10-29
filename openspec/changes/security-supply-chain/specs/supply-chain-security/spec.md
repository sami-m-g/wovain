# Spec Delta

## ADDED Requirements

### Requirement: Code is scanned for vulnerabilities

CodeQL for JavaScript and TypeScript SHALL run on every pull request, every push to main and weekly, and upload its results to code scanning. Semgrep CE SHALL run on the same triggers.

#### Scenario: Pull request

- **WHEN** a pull request is opened or updated
- **THEN** a `codeql` check runs and the main ruleset requires it

### Requirement: Dependencies are checked for known vulnerabilities

Both lockfiles (`pnpm-lock.yaml` and `infra/pnpm-lock.yaml`) SHALL be scanned with OSV-Scanner on pull requests and daily. A pull request SHALL fail dependency review when it adds a dependency with a high or critical vulnerability.

#### Scenario: Vulnerable dependency added

- **WHEN** a pull request adds a dependency with a high severity advisory
- **THEN** the `dependency-review` check fails

### Requirement: Dependency licenses are permissive

Dependencies in both lockfiles SHALL be under MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0 or MPL-2.0. The `licenses` job (OSV-Scanner) SHALL fail on any other license, or on an unknown one, unless `osv-scanner.toml` overrides or ignores it with a reason.

#### Scenario: Copyleft dependency

- **WHEN** a dependency is under a license outside the allowlist and has no exception
- **THEN** the `licenses` job and the dependency review fail

#### Scenario: Dependency without a license

- **WHEN** a dependency's license is unknown and `osv-scanner.toml` has no override for it
- **THEN** the `licenses` job fails

#### Scenario: MPL-2.0 dependency added

- **WHEN** a pull request adds a dependency under MPL-2.0
- **THEN** dependency review reports it as a warning and does not fail

### Requirement: Releases carry an SBOM

Publishing a GitHub Release SHALL attach a CycloneDX SBOM.

#### Scenario: Release published

- **WHEN** a release is published
- **THEN** its assets include `wovain-sbom.cdx.json`

### Requirement: Secrets are scanned in commits

`ggshield` SHALL scan the commits of every push and same-repository pull request, ignoring the vendored skill directories. Its API key SHALL be an Actions secret declared in `infra/github.ts` from a stack secret.

#### Scenario: Secret committed

- **WHEN** a commit contains a detectable secret
- **THEN** the `ggshield` check fails

### Requirement: Vulnerabilities are reported privately

`SECURITY.md` SHALL tell reporters to use GitHub private vulnerability reporting and SHALL NOT publish a personal email address.

#### Scenario: Researcher finds a flaw

- **WHEN** a researcher opens the repository's security policy
- **THEN** it links to the private advisory form and states the response times
