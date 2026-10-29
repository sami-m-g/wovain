# Tasks

Issue #188.

## 1. Releases

- [x] 1.1 release-please workflow and config, baseline v0.31.0
- [x] 1.2 `CHANGELOG.md` for v0.1.0 to v0.31.0 from git-cliff
- [x] 1.3 Deploy ignores release pull requests (version files)

## 2. Signing

- [x] 2.1 `sign-release.yml`: cosign bundle and SLSA provenance on the source tarball
- [x] 2.2 Deploy signs the web and docs images by digest

## 3. History

- [x] 3.1 `backfill-releases.yml` for v0.1.0 to v0.31.0
- [x] 3.2 `backfill-releases` runs by itself when `.github/backfill-releases.pending` reaches main; delete the file in a later pull request
- [x] 3.3 `RELEASE_PLEASE_TOKEN` declared in the `github` Pulumi stack from the `release-please-token` secret
- [ ] 3.4 Set the `release-please-token` stack secret and apply the `github` stack (infra/README.md)

## 4. Best Practices

- [x] 4.1 `CONTRIBUTING.md`, `SECURITY.md`
- [ ] 4.2 Register the project at https://www.bestpractices.dev/en/projects/new and add the badge to the README
