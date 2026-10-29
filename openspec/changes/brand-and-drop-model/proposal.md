# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/133

## Why

A merchant has one `brand_profile` row: a niche, taste references, Qloo entities, demographics, a free-text voice and a palette. Since #122 each idea also gets its own tone and palette (`drop-style` flag, `idea.style` column), and the brand voice reaches the writers as guardrails. That leaves three questions open:

- What may a drop change, and what must it never change?
- May a drop sell to an audience outside the brand's core audience?
- How does the brand itself change when sales show a drop did better than the brand defaults?

The user asked what real brands and print-on-demand sellers do. This change writes the answer down as one model, so the next implementation changes build to it.

## What Changes

Spec only. No app code, schema or migration changes in this change.

- **Brand.** The lasting identity: name and logo, niche and core Qloo audience, long-term taste references, voice (a personality plus hard guardrails such as "never crude"), a default palette with anchor colours and an optional "Always use my brand colours" lock, preferred blanks, and a price floor and margin.
- **Drop.** One release (a capsule of 4 to 6 products). It inherits the whole brand and may override only:
  - tone, within the guardrails;
  - palette, starting from the brand's anchor colours (free when the drop is Experimental);
  - the audience slice, inside the brand's core audience unless the audience rule allows otherwise;
  - the products, never priced under the price floor. The guardrails, the name and the price floor can never be overridden.
- **Experimental drops.** "Try something new" lets a drop leave the brand palette and its core audience. Experimental drops are tagged, so Insights can compare them with the brand's regular drops.
- **Audience outside the brand.** A regular drop's audience slice must overlap the brand's core Qloo audience. A drop whose audience doesn't overlap is allowed only as an Experimental drop or a collab, and the merchant is offered to start a new brand instead. When outside-audience drops keep winning, wovain proposes a new brand rather than moving the core audience. The evidence is in `design.md`.
- **Learning.** wovain compares drops with the brand defaults. Under `suggest` and `draft` it proposes a brand update with its evidence (for example "your experimental palette outsold the brand palette by 38% over 3 drops") into the approval queue. Under `publish_ads_paused` with the `autopilot` flag on, it applies the update, records it in the decision trace and offers an undo. A brand update never changes the guardrails, the name or the price floor.

## Capabilities

### New Capabilities

- `brand-and-drop`: the Brand and Drop model, what a drop inherits and may override, Experimental drops, the audience rule and brand updates learned from sales.

### Modified Capabilities

- `autonomy-and-approvals`: a new `brand.profile.update` action (R2) so brand updates follow the autonomy levels, with undo.

## Impact

- Follow-up changes: `packages/db` (a brand table that a merchant can have more than one of, drop fields), `packages/core` (`brand-identity.ts`, `brand-discovery.ts`, `drop-style.ts` from #122, `autonomy.ts`, `pricing.ts`, `insights.ts`), `packages/api` flows and `apps/web` brand and drop screens. The gaps are listed in `tasks.md`.
- A new `brand-drop-model` flag in `packages/core/src/flag-registry.ts` when the implementation starts.
- Builds on #60 (autonomy levels and the approval queue), #113 (brand discovery) and #122 (drop style).
