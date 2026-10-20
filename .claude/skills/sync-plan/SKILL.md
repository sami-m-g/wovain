---
name: sync-plan
description: Sync a devpost planning doc (scope, prd, spec) between its .md and .html companion, and carry a changed fact across scope, prd and spec. Use after editing either file, when the sync hook reports drift, or when the user asks to sync planning docs.
---

# sync-plan

Each planning doc in `devpost/` exists twice: `<name>.md` (read by the course skills) and `<name>.html` (the review page). The HTML is the source of truth.

## Steps

1. Check drift:
   ```bash
   bun scripts/plan-sync.ts devpost
   ```
   Exit 0 means every pair matches; stop there.
2. The output is a diff from `.md` to `.html`, one line per table row, list item, or paragraph:
   - `+` lines exist only in the `.html` → carry that text into the `.md`, under the matching heading and in the same table or list.
   - `-` lines exist only in the `.md` → stale or extra text. Replace it with the matching `+` line, or remove it if the HTML dropped it.
3. Diagrams are not compared by the script. If the HTML diagram changed, update the Mermaid block in the `.md` so its nodes, labels, and edges match the SVG.
4. Keep the `.md` frontmatter (`doc:`, `status:`) and section headings; the course skills read them. The HTML status tag must match `status:`.
5. Re-run step 1 until it prints "All planning docs are in sync."
6. Check the other planning docs for the same fact. A change in one doc (often `spec.md` after a build discovery) can contradict `scope.md`, `prd.md` or `spec.md` elsewhere. Search each for the changed terms (for example `grep -n -i '<term>' devpost/{scope,prd,spec}.md`), update every pair that states the old fact, and re-run step 1. Say which docs you checked and what changed, or that nothing else needed updating.

## Notes

- Headings are ignored by the check because the HTML groups some sections (for example into tabs).
- Edit with exact replacements; don't regenerate either file wholesale.
