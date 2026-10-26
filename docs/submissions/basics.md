---
doc: submission
hackathon: Build With AI: Basics
devpost: https://learn-ai-basics.devpost.com/
deadline: 2026-10-26 17:00 EDT (21:00 UTC)
status: draft
---

# Build With AI: Basics: submission pack for wovain

Facts, links, a video outline and a checklist for the Devpost form. Last refreshed 2026-10-26 against `docs/scope.md`, `docs/prd.md` and `docs/spec.md`.

The course (`.agents/skills/6-ship/SKILL.md`) says the learner writes the Devpost answers and the exit survey in their own words, and the agent only fixes spelling and grammar. So section 1 holds notes and prompts, not finished answers. Write each answer yourself.

The submission form needs a login, so the fields below are the standard Devpost project fields. Compare them with the live form once.

## 0. Facts (verifiable in the repo and at the live URLs)

Use these as the only source for claims. If something is not in this table, check it first.

| Fact | Source |
| --- | --- |
| Product: print-on-demand drops for independent fashion designers and small labels; print-on-demand only, no cut-and-sew | `docs/scope.md > Who It's For`, `> Explicitly Cut` |
| Flow: direction, ranked ideas with evidence, designs on Fourthwall blanks, Nemotron judge, approve, hidden Fourthwall products, ad variants, paused Meta campaign | `docs/scope.md > The Core Loop`, `docs/prd.md > The Core Journey` |
| Code gates (not model output): print size, price floor ($10 profit and 30% margin), daily budget $1 to $500, a `revise` design is never approved, every Meta object created paused | `docs/prd.md > Features and Behavior` |
| Merchants bring their own Fourthwall and Meta accounts (OAuth) and their own fal key. fal is in progress: until it ships the platform key is used | `docs/prd.md > Connectors` |
| wovain pays Nebius, Tavily and Qloo itself | `docs/prd.md > Product Decisions` |
| Launch is Free only (free monthly credits); paid plans are coming soon. Polar is the planned merchant of record. Billing is in review (MR !116) and prices are a proposal, so do not quote prices as live | `docs/prd.md > Billing and credits`, `> Open Questions` |
| Sign-in: Google and email (Better Auth); Better Auth UI screens are in review (MR !111) | `docs/prd.md > Sign-in and accounts` |
| Surfaces: website and ChatGPT app (MCP server) in one Next.js 16 app on Cloud Run | `docs/spec.md` |
| Autopilot (Nemotron decides inside the gates) is live | `docs/scope.md > The POC Boundary` |
| Mastra migration (durable runs, scorers) is in progress, not live | `docs/scope.md > The POC Boundary` |
| Planning docs: `scope.md`, `prd.md`, `spec.md` (each `status: approved`), `docs/app-map.html`; per-capability specs and changes in `openspec/` | repo |
| Built with the Devpost Learn Skill Pack in Claude Code (`.agents/skills/1-start` to `6-ship`), OpenSpec for specs and changes | repo, `docs/spec.md` |
| After deploy, three GitLab Duo flows are live: self-healing, scout, developer. Code review and deps-review flows are in review (!113, !114, !117) | `docs/prd.md > After deploy` |
| First commit 2026-10-06; course skills installed 2026-10-19; both inside the 2026-09-22 to 2026-10-26 period | `git log` (`55d9e69`, `8bdfde3`) |
| No customers, users, sales, revenue or testimonials exist, and none are claimed | `docs/scope.md > Explicitly Cut` |

### Links

| What | URL |
| --- | --- |
| Web app | <https://wovain.com> |
| ChatGPT app (MCP server URL) | <https://mcp.wovain.com/api/mcp> |
| Docs (en, fr, es) | <https://docs.wovain.com> |
| Public repo (MIT) | <https://github.com/sami-m-g/wovain> |
| Planning docs | <https://github.com/sami-m-g/wovain/blob/main/docs/scope.md>, `.../prd.md`, `.../spec.md` |
| Demo video | to add after upload (YouTube or Vimeo, public) |

## 1. Devpost form: notes and prompts for you to write

Judging criteria (equally weighted, from the rules): Design (complete, coherent product, not only a proof of concept), Potential Impact (a credible, specific case for a real problem and audience), Innovation/Idea, Presentation (video shows it working end to end; says what problem, who it is for, why it matters). Stage one is pass/fail: fits the theme and was built with the Learn Skill Pack, shown by the planning docs.

### Project title

Your call. Current: wovain.

### Tagline (60 characters max)

Write your own. Say who it is for and what it ends with. Do not promise sales.

### Project story: write each part yourself

**Inspiration**

- Who the customer is: an independent designer or small label that is also art director, merchandiser and marketer.
- The week of non-design chores in a small capsule: research, files per blank, listings, prices that survive fees, ads in Ads Manager.
- Your own reason for building it (from `scope.md > Why This Matters to the Learner`).

**What it does**

- The flow in your words, from a described drop to a paused Meta campaign. Mention that the designer approves each step.
- Taste (Qloo) times moment (Tavily), and ideas show their evidence.
- Autopilot, and the gates code enforces.
- It works in your own Fourthwall, Meta and fal accounts, on the website and in ChatGPT.
- Free at launch, paid plans coming soon. No prices.

**How I built it**

- The Learn Skill Pack path: interview, scope, PRD, spec, build, ship.
- OpenSpec for capability specs and changes; Claude Code agents doing the work; GitLab Duo flows after deploy.
- Stack in one or two lines (Next.js, oRPC, Better Auth, Drizzle and PostgreSQL, Cloud Run).
- Existing services wired together, not rebuilt.

**Challenges**

- Deciding what the model may decide (models suggest, code guarantees).
- Failing one step cleanly when a provider key is missing or a provider fails.
- Working inside the merchant's own accounts (OAuth, sealed tokens). Meta app review scope is still open.
- Moving from a one-person demo to a product: own accounts, credits, billing.

**Accomplishments**

- Pick only what you can show: the live loop, the paused campaign, nothing activated by wovain.
- Say plainly that there are no users or sales yet.

**What I learned**

- What planning first changed. What you cut and why.

**What's next**

- From `scope.md > Later`: paid plans, optimizer, multi-product sets, organizations and seats, TikTok. Pick the two or three you care about.

### Built with (tags)

Trim to what the code ships; check each one. Candidates: typescript, nextjs, react, tailwindcss, shadcn-ui, orpc, better-auth, drizzle-orm, postgresql, google-cloud-run, pulumi, model-context-protocol, chatgpt, claude-code, nvidia-nemotron, nebius-token-factory, qloo, tavily, fal, fourthwall, meta-ads, fumadocs, gitlab-duo, openspec, posthog. Add `polar` and `mastra` only if they are live when you submit (both are still in review or in progress).

### "Try it out" links

Use the links table above.

### Testing instructions (notes)

The rules say the project must be free to test, with no restriction, until the judging period ends (2026-10-30), and that a private site needs login credentials in the testing instructions. State plainly:

- Open <https://wovain.com>, sign in (Google or email). It is on the Free plan.
- What a judge needs to run the whole flow: their own Fourthwall shop, Meta ad account and (once shipped) fal key. Say what happens without them.
- Decide whether to give a judge a pre-connected test account. If you do, put the credentials only in the Devpost box, never in the repo.
- ChatGPT: add a connector with `https://mcp.wovain.com/api/mcp`, sign in, approve access.
- Meta objects are always created paused.

### Other form items

- Team: Mina Sami (sami-m-g), also the representative.
- Images: 3 to 5 screenshots (ideas with evidence, design with verdict, approval, Fourthwall product, paused campaign).
- Exit survey: answer yourself.

## 2. Video outline (record 2:30; rule: under 3:00)

The rules: under 3 minutes, shows the project working on the device it was built for, public on YouTube or Vimeo, no third-party trademarks or copyrighted music or material without permission. Judges may stop at 3:00. Presentation is judged on end-to-end working, who it is for and why it matters.

Record a real run (pre-run once so the slow steps are ready, or cut the waiting). Show only what is live; use whatever the UI looks like at recording time. Say the narration in your own words; the lines below are beats, not a script.

| Time | On screen | Beat to cover |
| --- | --- | --- |
| 0:00 to 0:25 | Face or title card, then <https://wovain.com> | Problem: an independent designer or small label spends a week of non-design chores on every small capsule (research, files per blank, listings, prices, ads). Who it is for, and that wovain is print-on-demand only. |
| 0:25 to 0:40 | Signed-in dashboard, connections page | Your own Fourthwall and Meta (and fal) accounts are connected; wovain does not hold the money or activate spend. Free plan, paid plans coming. |
| 0:40 to 0:55 | Describe a drop (direction, who it is for, countries, daily budget) | The brief. |
| 0:55 to 1:15 | Ranked ideas; open one idea's evidence | Designs start from taste (Qloo) and moment (Tavily); every idea shows its signals, sources and score inputs. |
| 1:15 to 1:40 | Designs on real Fourthwall blanks with price, profit, margin; Nemotron verdict and fixes | Designs: art, price from the blank's base cost, a judge. Code, not the model, checks print size and the price floor. |
| 1:40 to 1:55 | Approve | Approval gate: nothing moves on until you decide. |
| 1:55 to 2:10 | Fourthwall admin showing the new hidden product | Approved design becomes a Fourthwall product, hidden until you publish. |
| 2:10 to 2:25 | Ad variants, then Meta Ads Manager with a Paused campaign | Paused Meta campaign for the countries and budget chosen. This is the end of the loop. |
| 2:25 to 2:35 | Insights view or campaign results, if live at recording time | Insights: what you can see after the campaign exists. If not live, say it is next and skip the shot. |
| 2:35 to 2:50 | Repo: `docs/scope.md`, `prd.md`, `spec.md`, `openspec/`; a GitLab Duo flow MR | How it was built with AI: scope, PRD and spec first; OpenSpec changes; Claude Code agents; GitLab Duo flows watching the repo after deploy. |
| 2:50 to 3:00 | Title card with URL | What's next (two or three items from `scope.md > Later`) and where to try it. |

That outline ends at 3:00, which is over the limit (the rule is under 3:00). Tighten to about 2:30 by shortening the intro, the connections shot and the repo shot, and merge or drop the closing title card. Keep the final cut at 2:50 or less.

Check before recording:

- Is an insights view live? If not, drop that row and say what is next instead (do not mock it).
- The Fourthwall, Meta and ChatGPT screens show those companies' marks. Keep those shots short and crop to the product and campaign list, or decide you are comfortable under their terms.
- Fresh browser profile; test shop and ad account; no personal tabs, notifications or account IDs.
- No music, or royalty-free music you have rights to.
- English captions.
- Upload to YouTube or Vimeo as public, then open the link in a private window.

## 3. Pre-submit checklist

Mark each when verified, not before. The deadline is 2026-10-26 17:00 EDT (21:00 UTC).

| Requirement (rules or `6-ship`) | Proof | Status |
| --- | --- | --- |
| Joined the hackathon on Devpost | <https://learn-ai-basics.devpost.com/> | To do (your account) |
| New project created in the period (2026-09-22 to 2026-10-26); pre-existing code disclosed | First commit 2026-10-06 (`55d9e69`), skills 2026-10-19 (`8bdfde3`). Starter templates and libraries are allowed; list anything else pre-existing in the form | Verify |
| Built with the Devpost Learn Skill Pack | `.agents/skills/1-start` to `6-ship` | Met |
| `scope.md`, `prd.md`, `spec.md` in the repo (stage-one pass/fail) | `docs/` on `main`, each `status: approved` | Met once this MR is merged |
| Public repo on GitHub, GitLab or Bitbucket with all source and instructions | <https://github.com/sami-m-g/wovain>; open in a private window | Verify |
| Open source license detectable and visible in the repo's About section | `LICENSE` (MIT); check the About box shows "MIT license" | Verify |
| Setup instructions and placeholder env vars, no real secrets | `README.md`, `apps/web/.env.schema`; scan history for secrets | Verify |
| Working proof of concept, one function end to end | One full real run on <https://wovain.com> before recording | Verify |
| Project free to test, no restriction, until judging ends (2026-10-30) | Free plan only; testing instructions say what a judge needs (own Fourthwall, Meta, fal accounts) or provide a test account | Decide |
| Third-party APIs used within their terms | Qloo key is a hackathon key (commercial licence open); Meta app review scope open | Review |
| Text description of features and functionality | Section 1, written by you | To do (yours) |
| Demo video: under 3 minutes, public on YouTube or Vimeo, shows it working, no third-party trademarks or copyrighted music | Section 2 | To do |
| Video URL in the repo | `README.md` "Demo: URL placeholder" and `docs/spec.md` "Video URL: to be added" | To do after upload |
| Materials in English | Docs and video captions | Met |
| Testing instructions; credentials in the form only if a private test account is given | Section 1 | To do |
| Exit survey completed | Devpost flow | To do (yours) |
| Submission saved and submitted before 21:00 UTC; no edits after the deadline | Devpost project page | To do |

Known risks:

- Judges are not required to run the project; the video and description may be all they see. The video has to carry the end-to-end proof.
- "Free of charge and without any restriction" versus a flow that needs the judge's own Fourthwall and Meta accounts: say it clearly or offer a pre-connected test account.
- Docs mention features that are in review or in progress (Better Auth UI, Polar billing, fal connector, Mastra). Do not show or claim them unless they are merged and deployed when you record.
- The `devpost/` folder the skills expect is not in the repo; the planning docs live in `docs/`. The rules only name the three files.
