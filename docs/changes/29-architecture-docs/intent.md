# Intent: document the architecture, data model and DevSecOps coverage

Issue: #29

## Problem

Judges and new contributors have no single picture of how wovain is built, what it stores, or which GitLab feature covers each DevSecOps stage.

## Desired outcome

- A C4-style architecture overview and a data model doc for the Firestore collections.
- A README table mapping plan, create, verify, package, secure, release, configure, monitor and govern to the automated feature, flow or agent.
- Custom Duo agents only where built-ins and the deterministic ops jobs leave a gap, and only read-only ones.
- docs/transcend.md: each prize, how wovain meets it, the evidence, and what is blocked by Maintainer-only settings.

## Constraints

- Built-in flows first; a custom agent only where they leave a gap. Keep credits low.

## Open questions

None.
