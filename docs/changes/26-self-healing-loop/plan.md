# Plan: turn Duo on and close the self-healing loop

Spec: [spec.md](spec.md)

## Files that change

- `infra/Pulumi.prod.yaml`: triggers active; `wovain:o11yGroupId`; notes on why the loop chains flows.
- `infra/index.ts`: `logging` and `monitoring` APIs, the `gitlab-ops` account and its trust, CI variables.
- `infra/gitlab.ts`: `operations` environment, `wovain loop` schedule and its scanner switches, `verified` label, `created` for new CI variables.
- `apps/ops/**`: the loop and its unit tests.
- `.gitlab/ci/loop.yml`, `.gitlab-ci.yml`: the job.
- `apphosting.yaml`: the OTLP endpoint.
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `.config/knip.json`, `.config/jscpd.json`: the new package in tests, typecheck and the gates.
- `docs/loop.md` (diagram), `README.md`, `docs/spec.md`, `docs/app-map.html`.

## Order of work

1. Pure logic with tests: fingerprints, redaction, grouping, the verification rule, guardrails.
2. Clients for GitLab, Google Cloud and GitLab Observability.
3. Scout, verify, shepherd and the entry; a local read of Cloud Logging and Monitoring with my own credentials.
4. Infra and CI; `pnpm infra:preview` to check the plan (no `up`).
5. Docs.

## Risks

- The SigNoz v5 response shape isn't documented; the reader is loose, and a failure stops the run with a status code. Until the API key exists it isn't called at all.
- Duo's reviewer state might stay `unreviewed` if a review fails; the MR then waits for a person.
- If the Developer flow writes `Closes #n`, the merge closes the issue early; verify still runs on closed issues and reopens on a regression.

## Tests that prove it

- `apps/ops/test/signals.test.ts`, `apps/ops/test/guardrails.test.ts`.
- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test`, `pnpm build`, `pnpm infra:preview`.
- The proof run after merge: a seeded bug goes through the whole loop.
