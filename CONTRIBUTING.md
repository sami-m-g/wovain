# Contributing to wovain

Thank you for helping. This page says how to propose a change, what a change needs to be accepted, and how releases happen. [AGENTS.md](AGENTS.md) holds the repository layout and the tooling rules; read it first.

## Report a bug or ask for a feature

Open an issue from the [issue forms](https://github.com/sami-m-g/wovain/issues/new/choose). Report a vulnerability privately, as [SECURITY.md](SECURITY.md) says, never as an issue.

## Set up

1. Install the Node version in `.nvmrc` and pnpm (the version in `package.json`, `packageManager`).
2. `pnpm install`, then `pnpm run db:start` for the local Postgres.
3. Copy the settings `apps/web/.env.schema` asks for into `apps/web/.env.local`.
4. `pnpm dev:web` starts the app on http://localhost:3000.

## Make a change

1. Open or pick an issue. A feature change starts as an OpenSpec change (`/opsx:propose`) that links the issue; the specs in `openspec/specs/` are the current truth.
2. Branch from `main` and open a pull request against `main`. Say `Closes #<issue>` in the description.
3. Keep the pull request to one topic.

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and `commitlint` checks them: `type(scope): subject`, for example `fix(billing): settle credits once`. Use `feat` for a feature, `fix` for a bug fix, and `docs`, `refactor`, `perf`, `test`, `build`, `ci` or `chore` for the rest. Mark a breaking change with `!` or a `BREAKING CHANGE:` footer. The types drive the version and the changelog (see Releases).

### Code style

Ultracite (Oxlint and Oxfmt) formats and lints the code. Run `pnpm exec ultracite fix` before you commit. Do not edit vendored or generated files; AGENTS.md lists them and the command that updates each.

## Tests and checks

- A new feature needs tests, and a bug fix needs a test that fails without the fix. Put them beside the code; the suites run with Vitest (`pnpm test`).
- A change that cannot be tested automatically says why in the pull request.
- Before you push, run `pnpm run check`, `pnpm run check-types`, `pnpm run knip`, `pnpm run spec:validate` and `pnpm test`.
- CI must pass. The required checks on `main` are `verify`, `infra`, `codeql`, `dependency-review` and `osv / osv-scan`; a pull request is not merged while one of them fails.
- Dependency, license and secret scans run on every pull request. A change must not add a dependency with a known high-severity vulnerability.

## Review

Every pull request into `main` needs one approval before it merges (the main ruleset requires it; CodeRabbit reviews, and the maintainer decides). Direct pushes to `main` are not allowed. Address review comments with new commits; the approval is dismissed when you push.

## Releases

Releases are automatic. [release-please](https://github.com/googleapis/release-please) reads the conventional commits on `main`, keeps a release pull request with the next version and the [CHANGELOG](CHANGELOG.md) entry, and the maintainer merges it to publish a GitHub Release. Each release has a signed source archive and SLSA provenance (see SECURITY.md); verify a download with `gh attestation verify <file> --repo sami-m-g/wovain`.

## Licence

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
