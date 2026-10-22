# Plan: document the architecture, data model and DevSecOps coverage

Spec: [spec.md](spec.md)

## Files that change

- docs/architecture.md, docs/data-model.md, docs/transcend.md (new); README.md; .gitlab/duo/catalog/agents/explain.yml (new).

## Order of work

1. Data model from the schemas and the existing spec section.
2. Architecture views.
3. Stages table and the read-only agent.
4. Transcend write-up.

## Risks

- Mermaid C4 is still marked experimental; if GitLab renders it badly, the delivery flowchart and the tables still carry the content.

## Tests that prove it

- validate-items (the ai-catalog component) on the agent; pnpm check.
