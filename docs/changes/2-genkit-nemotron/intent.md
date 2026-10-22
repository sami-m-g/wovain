# Intent: Genkit and Nemotron on Nebius Token Factory for wovain's own model calls

Issue: #2

## Problem

wovain makes no model calls of its own. The host agent (ChatGPT, Claude) does all the thinking, so every check on a design depends on the agent following the playbook to the letter. Nothing on the server checks a design before the widget shows it: a listing title that buries the keyword, a description full of garment specs, colors that vanish against the art, or artwork too small for the print size reaches the merchant as is. The learner also wants the Nebius × NVIDIA prize (due Oct 30, 10:00 PDT), which needs a real Nemotron call on Nebius Token Factory at runtime.

`docs/spec.md` already names Genkit as the agent framework, but no code uses it.

## Desired outcome

- Genkit runs in `apps/server` and is the one layer for wovain's own model calls. It reaches Nebius Token Factory through `@genkit-ai/compat-oai` (`openAICompatible({ name: "nebius", apiKey, baseURL: "https://api.tokenfactory.nebius.com/v1/" })`).
- One wovain tool makes a real Nemotron call: a design judge that scores a design brief and its artwork metadata against wovain's print rules and returns a zod-checked verdict, so the agent fixes problems before the widget appears.
- Without `NEBIUS_API_KEY` the server starts and every other tool works. The judge says plainly that it isn't configured, the way `create_rules` and `video_spend` do for their keys.
- Tests mock the model. One opt-in test calls Token Factory when the key is set.
- The README has a "Nebius and Nemotron" section: which model, which calls, how to run them.

## Constraints

- Work starts now, before the Nebius key exists. Nothing may need the key to build, test or deploy.
- Qloo and Tavily are separate issues; this change doesn't touch them.
- `NEBIUS_API_KEY` is already optional in `env.ts`, `.env.example` and the infra secrets (!29). This change adds no infra secret and doesn't run `pulumi up`. `apphosting.yaml` lists the key once it has a value.
- Image judging, the copyright check and showing the judge's reasons on the widget belong to #4. This judge reads text and numbers only, and #4 extends it.
- No change to stored Firestore record shapes.
- New packages use exact pins and respect Renovate's 7-day minimum release age.
- AGENTS.md: TypeScript only, Ultracite, Conventional Commits.

## Open questions

None that block the plan. The choices that need approval are under Risks in `plan.md`.
