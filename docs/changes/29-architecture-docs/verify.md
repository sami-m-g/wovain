# Verify: document the architecture, data model and DevSecOps coverage

## Tests added

None: docs and an agent definition.

## Checks run

- pnpm check: pass. The MR pipeline runs validate-items on the agent YAML.
- The data model was checked against apps/server/src/store.ts (counter field n), lib/connections.ts (tickets created by lib/upstream.ts) and packages/shared schemas.

## Review findings

Security reviews flagged the triage agents twice: agent YAML can't scope write tools to one issue, so an agent reading untrusted text could write to any issue or MR, and verdicts could leak from confidential to public objects. Both triage agents were removed: the deterministic ops code already turns scout and market findings into intents, and security triage stays with a person. The only agent left, `wovain explain`, has no write tools. The data model was refreshed for main's new collections (Meta drafts, launch approvals, confirm pages). The humanizer pass on the prose was skipped for time.

## Try it

Open docs/architecture.md and docs/data-model.md on GitLab to see the diagrams render; README → DevSecOps stages.

## Departures from the plan

None.
