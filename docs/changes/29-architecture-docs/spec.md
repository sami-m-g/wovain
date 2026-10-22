# Spec: document the architecture, data model and DevSecOps coverage

Intent: [intent.md](intent.md)

## Requirements

1. docs/architecture.md: C4 context and container diagrams (mermaid) and the delivery flow.
2. docs/data-model.md: an ER diagram and a table per collection and the bucket (holds, written by, read by, lifetime), matching store.ts and connections.ts.
3. README: Architecture and data links, and the DevSecOps stages table with what is blocked.
4. `.gitlab/duo/catalog/agents/explain.yml`: one read-only chat agent that explains pipeline and MR failures; its tools only read.
5. docs/transcend.md: prizes, evidence, framing, blocked settings.

## Design

Docs only, plus one agent definition that the existing ai-catalog component validates and syncs. No code.

## Areas of concern

- The agent can't be enabled until a Maintainer enables it in the top-level group; the docs say so.
- The agent has no write tools, so untrusted log or MR text can't make it change anything.
