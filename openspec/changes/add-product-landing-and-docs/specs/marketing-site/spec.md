# Spec Delta

## Purpose

The public landing page and user docs: who wovain is for, what it does, and how to use it, in the voice set in `.agents/product-marketing.md`.

## ADDED Requirements

### Requirement: Product positioning

The landing page SHALL present wovain as print-on-demand for independent fashion designers and small labels, without internal terms (agent, MCP, model or protocol names) and without invented customers, metrics or testimonials.

#### Scenario: Copy review

- **WHEN** landing copy is changed
- **THEN** it uses the words in `.agents/product-marketing.md` and claims no users, sales or results

### Requirement: Docs for designers and developers

The docs site SHALL separate a Guide for designers from Developer internals, keep old URLs working, and ship English, French and Spanish together.

#### Scenario: Old link

- **WHEN** someone opens a docs URL from before the split
- **THEN** they reach the same page in its new location

### Requirement: Single logo source

The logo SHALL render only through the `<Logo/>` component.

#### Scenario: New mark

- **WHEN** the logo changes
- **THEN** only `<Logo/>` and its assets change
