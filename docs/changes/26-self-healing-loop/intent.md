# Intent: turn Duo on and close the self-healing loop

Issue: #26

## Problem

A production error reaches a person only when someone looks. The three Duo triggers are off, and the scheduled scout flow never runs, because enabling a custom flow at project level created no trigger.

## Desired outcome

- The Duo triggers are on with their filters: Developer on assign or mention, Code Review on reviewer requested or ready, Fix CI/CD only on a failed push pipeline on main.
- A scheduled scout reads production's errors (Cloud Logging, Cloud Monitoring, GitLab Observability) and files one issue per new problem with the evidence, assigned to the Duo Developer flow.
- Duo Code Review reviews the Developer flow's merge request, and GitLab's auto-merge merges it on a green pipeline when it stays inside guardrails.
- After the deploy, the scout checks the problem's error rate and closes the issue with the numbers, or reopens it.
- A mermaid diagram shows the loop.

## Constraints

- Flows bill the person whose action triggered them; about 457 credits remain. Triggers stay filtered and the loop files at most one issue per run.
- Agents never merge. GitLab's auto-merge does, after Duo review and a green pipeline, and never for infra, auth, CI config, dependencies or large diffs.
- No `pulumi up` by hand: CI applies `infra/`.
- Log text is untrusted: it's redacted and fenced before it reaches an issue a flow reads.

## Open questions

None. The owner approved turning the triggers on and the autonomous loop (through the coordinator, 2026-10-22).
