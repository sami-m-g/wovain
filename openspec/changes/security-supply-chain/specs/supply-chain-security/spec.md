# Spec Delta

## ADDED Requirements

### Requirement: Code is scanned for vulnerabilities

CodeQL for JavaScript and TypeScript SHALL run on every pull request, every push to main and weekly, and upload its results to code scanning. Semgrep CE SHALL run on the same triggers.

#### Scenario: Pull request

- **WHEN** a pull request is opened or updated
- **THEN** a `codeql` check runs and the main ruleset requires it

### Requirement: Dependencies are checked for known vulnerabilities

Every lockfile (`pnpm-lock.yaml`, `infra/pnpm-lock.yaml` and the Docker tool lockfiles under `docker/`) SHALL be scanned in full with OSV-Scanner on every pull request, every push to main and daily, and the scan SHALL fail on any known vulnerability that `osv-scanner.toml` does not ignore with a reason. A pull request SHALL fail dependency review when it adds a dependency with a high or critical vulnerability.

#### Scenario: Vulnerable dependency added

- **WHEN** a pull request adds a dependency with a high severity advisory
- **THEN** the `dependency-review` check fails

#### Scenario: Vulnerability already in the lockfile

- **WHEN** a pull request leaves a known vulnerability in a lockfile that it did not add
- **THEN** the `osv / osv-scan` check fails and the main ruleset requires it

#### Scenario: Vulnerability with no fixed release

- **WHEN** a vulnerable package has no fixed release and the repository patches it (pnpm `patchedDependencies`)
- **THEN** `osv-scanner.toml` ignores that advisory with the patch as its reason, and the scan passes

### Requirement: Build inputs are pinned by hash

Every external image in a Dockerfile SHALL be pinned by digest, every GitHub Action by commit SHA, and every npm install in a Dockerfile SHALL be `npm ci` from a committed lockfile. Dependabot SHALL update the docker digests, the actions and the Docker tool lockfiles.

#### Scenario: New base image release

- **WHEN** `node:26-slim` publishes a new digest
- **THEN** Dependabot opens a pull request that updates the digest in both Dockerfiles

### Requirement: The default branch is protected

The main ruleset SHALL block deletion and force-push, SHALL require a pull request with one approval that a new push dismisses, and SHALL require the `verify`, `infra`, `codeql`, `dependency-review` and `osv / osv-scan` checks. The approval SHALL come from CodeRabbit, which requests changes on blocking findings and approves once they are resolved, and no one MAY bypass the ruleset.

#### Scenario: Direct push to main

- **WHEN** anyone, an admin included, pushes a commit directly to main
- **THEN** GitHub refuses the push

#### Scenario: Unresolved review finding

- **WHEN** CodeRabbit has requested changes on a pull request and they are not resolved
- **THEN** the pull request cannot merge, whoever opened it

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
