# Tasks

Gaps between the current code and the model (#133). Each group is a follow-up change behind a new `brand-drop-model` flag. Nothing here is built in this change.

## 1. Brand (gaps in `brand_profile` and `brand-identity.ts`)

- [ ] 1.1 A merchant can own one Brand only: `brand_profile.userId` is unique. Add a brand table with many rows per merchant, move today's row into it as the first Brand, and add `brandId` to `drop` (nullable first, then required)
- [ ] 1.2 No logo: the Brand has only `displayName`. Add a logo asset
- [ ] 1.3 Voice is one free-text field. Split it into a personality and a list of guardrails; #122's `drop-style` passes the whole voice as guardrails today
- [ ] 1.4 The palette has no anchor colours and no "Always use my brand colours" lock
- [ ] 1.5 No core Qloo audience as one object: `qlooEntities` and `demographics` are separate and the tags are not saved. Save the core audience (entities, tags, demographics) from `brand-identity.ts` and `brand-discovery.ts`
- [ ] 1.6 No preferred blanks on the Brand
- [ ] 1.7 The price floor and margin are global (`PRICING_RULES` in `pricing.ts`). Add a per-Brand price floor and margin that can only raise the global floor

## 2. Drop (gaps in `drop`, `drop_item` and #122)

- [ ] 2.1 Tone and palette live on the idea (`idea.style`, #122), not on the drop. Move or copy the picked style to the drop as its overrides
- [ ] 2.2 Check a regular drop's palette keeps an anchor colour, and use the Brand palette while the lock is on
- [ ] 2.3 Enforce 4 to 6 products per drop before `store.drop.publish`
- [ ] 2.4 Check each `drop_item.priceCents` against the Brand's price floor
- [ ] 2.5 Check the drop tone against the guardrails (the writers get them; nothing checks the output yet)
- [ ] 2.6 Add an `experimental` tag and a "Try something new" switch to the new-drop flow

## 3. Audience rule

- [ ] 3.1 No audience slice on a drop: `drop.qlooTags` only. Add the slice and its overlap score with the core audience
- [ ] 3.2 The overlap score from Qloo (shared tags and entities, weighted by affinity) and its threshold as per-environment configuration
- [ ] 3.3 The "far from your brand's buyers" prompt with "start a new brand" and "run it as an experiment"; refuse a regular drop under the threshold
- [ ] 3.4 A collab drop type or field (open question in `design.md`)
- [ ] 3.5 A new-brand suggestion when 2 or more Experimental drops for one outside audience outsell the regular drops

## 4. Insights

- [ ] 4.1 `insights.ts` reads shop and ad reports, not per-drop results. Report revenue per drop, sell-through and ad CTR per drop, by Fourthwall collection
- [ ] 4.2 Show Experimental drops beside the Brand's regular-drop average

## 5. Learning and autonomy

- [ ] 5.1 Add `brand.profile.update` (R2) to the catalog in `autonomy.ts`, allowed under `publish_ads_paused` only while the `autopilot` flag is on
- [ ] 5.2 Refuse a payload that changes the guardrails, name, logo or price floor
- [ ] 5.3 The learner: evidence from Insights (at least 2 drops and 30 orders, at most once a month per field), proposals with their evidence into the approval queue
- [ ] 5.4 The executor that applies the update, records it in the decision trace and the audit log, and undoes it with the `inverse`
- [ ] 5.5 The yearly brand review suggestion

## 6. Docs and checks

- [ ] 6.1 Update `docs/scope.md`, `docs/prd.md`, `docs/spec.md` and their docs-site copies when the model ships
- [ ] 6.2 Tests for each rule above in `packages/core`; `pnpm run check`, `check-types`, `knip` and `spec:validate`
