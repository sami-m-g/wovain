# Tasks

Issue #65.

## 1. Run

- [x] 1.1 Research returns the top `DESIGNS_PER_RUN` ideas, led by autopilot's pick
- [x] 1.2 The design, autopilot, product and campaign steps handle a list; one item failing never fails the others
- [x] 1.3 The gate waits for every design's decision and resumes once, after commit
- [x] 1.4 Both engines list each approved design (legacy manual: the wizard does)

## 2. Wizard

- [x] 2.1 Going on from the designs step rejects the undecided designs
- [x] 2.2 One failed draw keeps the others

## 3. Tests and docs

- [x] 3.1 Tests for the gate, the early-open gate and partial failures
- [x] 3.2 `docs/spec.md`, `docs/prd.md`, `docs/scope.md` and the docs-site copies
