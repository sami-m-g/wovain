---
name: sync-plan
description: Sync a devpost planning doc (scope, prd, spec) between its .md and .html companion. Use after editing either file, when the sync hook reports drift, or when the user asks to sync planning docs.
---

# sync-plan

Each planning doc in `devpost/` exists twice: `<name>.md` (read by the course skills) and `<name>.html` (the review page). The HTML is the source of truth.

## Steps

1. Check drift:
   ```bash
   uv run -q --script .claude/skills/sync-plan/scripts/plan_sync.py devpost
   ```
   Exit 0 means every pair matches; stop there.
2. The output is a diff from `.md` to `.html`, one line per table row, list item, or paragraph:
   - `+` lines exist only in the `.html` → carry that text into the `.md`, under the matching heading and in the same table or list.
   - `-` lines exist only in the `.md` → stale or extra text. Replace it with the matching `+` line, or remove it if the HTML dropped it.
3. Diagrams are not compared by the script. If the HTML diagram changed, update the Mermaid block in the `.md` so its nodes, labels, and edges match the SVG.
4. Keep the `.md` frontmatter (`doc:`, `status:`) and section headings; the course skills read them. The HTML status tag must match `status:`.
5. Re-run step 1 until it prints "All planning docs are in sync."

## Notes

- Headings are ignored by the check because the HTML groups some sections (for example into tabs).
- Edit with exact replacements; don't regenerate either file wholesale.
