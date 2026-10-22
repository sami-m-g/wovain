# Verify: MR 2, vendor claude-ads and the print-on-demand overlay (#25)

The plan, spec and intent for #25 are on `feat/optimizer` (`docs/changes/25-optimizer/`). This MR is plan.md's MR 2. It adds no runtime code.

## Tests added

- `scripts/skills-check.ts` (`pnpm skills:check`, run by `pnpm check` locally and in CI's verify job): recomputes each claude-ads skill's hash the way `skills` 1.7.2 does (`computeSkillFolderHash`: every file's relative path and bytes, sorted by path) and compares it with `computedHash` in `skills-lock.json`. Proven both ways: it passes on the fresh copy, and after appending one byte to `.agents/skills/ads-math/SKILL.md` it fails with `Vendored skills changed or missing: ads-math` and exits 1. A missing folder fails too.
- The test that keeps the overlay's rule IDs in step with code is MR 3's: it needs `packages/shared/src/optimizer/`. Every rule ID here is a `### <ID> <name>` heading, so that test can read them with `/^### (POD-[A-Z]\d+|R\d)\b/m`.

## Checks run

| Command | Result |
| --- | --- |
| `pnpm check` (ultracite plus `skills:check`) | Pass, 10 vendored skills match |
| `pnpm typecheck` | Pass (now also covers `scripts/`) |
| `pnpm knip` | Pass |
| `pnpm arch` | Pass |
| `pnpm dupes` | Pass, 0 clones |
| `pnpm test` | Pass, 98 tests |
| `pnpm test:integration` | Pass |
| `pnpm build` | Pass |

## What was vendored

- `pnpm skills add AgriciDaniel/claude-ads --skill ads ads-optimize ads-meta ads-attribution ads-creative ads-math ads-budget ads-test ads-monitor ads-report -a universal -y --copy`. The `universal` agent is the one whose project folder is `.agents/skills/`, so nothing went to `.claude/skills/`.
- Source: claude-ads `main` at `fc3908e` (2026-10-17). It differs from the `v2.1.0` tag only in `.github/`, so the skill files are 2.1.0's.
- 49 files, committed unchanged. `skills-lock.json` pins each of the ten with its `computedHash`; the lock format has no ref field, so the commit is recorded here and in `NOTICE`.
- The vendored folders are left out of oxfmt (`oxfmt.config.ts`) and the lefthook fix glob, so no formatter rewrites them. oxlint, jscpd and knip don't read Markdown or YAML.
- The claude-ads plugin stays installed for Claude Code. The vendored copies get no `.claude/skills/` symlinks, which would duplicate the plugin's skills; GitLab Duo and other agents read them from `.agents/skills/`.

## The overlay

`.agents/skills/wovain-pod-ads/` (with the `.claude/skills/wovain-pod-ads` symlink, as AGENTS.md asks of project skills):

| File                           | Rule IDs                     |
| ------------------------------ | ---------------------------- |
| `references/economics.md`      | POD-E1 to POD-E6             |
| `references/kills.md`          | POD-K1 to POD-K4             |
| `references/creative.md`       | POD-C1, POD-C2               |
| `references/operations.md`     | POD-O1 to POD-O5             |
| `references/seasonality.md`    | POD-S1 to POD-S4             |
| `references/measurement.md`    | POD-M1 to POD-M3             |
| `references/reconciliation.md` | R1 to R5, and the kill block |

Facts the spec marks unverified (Fourthwall production times per blank, ship-by cutoffs, refund reasons, chargebacks in payout transactions, earlier fatigue on niche apparel) stay labeled unverified. The prose went through the humanizer skill.

`NOTICE` carries claude-ads' MIT text and copyright line, the version and commit, the vendored folders, and the wovain files that adapt it (the overlay now; `apps/server/src/optimizer/guidance.ts` and `packages/shared/src/optimizer/math.ts` when they land).

## Review findings

- humanizer: one contrast in the overlay's opening ("doesn't replace claude-ads; it narrows it") rewritten as a direct statement.

## Try it

- `pnpm skills:check` prints `10 vendored skills match skills-lock.json`.
- Edit any file under `.agents/skills/ads-*/` and run `pnpm check`: it fails and names the skill. Restore it with `git checkout`.
- In Claude Code, `/wovain-pod-ads` loads the overlay, which points to the claude-ads skill to read first.

## Departures from the plan

- `skills` 1.7.2 has no verify command, so the check is `scripts/skills-check.ts`, as the spec allowed. `scripts/` gets its own `tsconfig.json`, referenced from the root, so `pnpm typecheck` and the type-aware lint cover it.
- The CLI's agent flag is `-a universal` (the spec's command has none; without it the CLI would ask or pick the detected agents).
