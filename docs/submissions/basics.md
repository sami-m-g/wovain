---
doc: submission
hackathon: Build With AI: Basics
devpost: https://learn-ai-basics.devpost.com/
deadline: 2026-10-26 17:00 EDT
status: draft
---

# Build With AI: Basics: submission pack for wovain

Draft copy for the Devpost form, a video script and a pre-submit checklist.

Heads-up from the course: the `6-ship` skill (`.agents/skills/6-ship/SKILL.md`) says the learner writes the submission answers and exit-survey reflections in their own words, and that the agent only fixes spelling and grammar. The rules page does not say this. Treat sections 1 and 2 as notes and a draft to rewrite in your own voice before pasting, and answer the exit survey yourself.

The Devpost submission form needs a login, so its fields below are the standard Devpost project fields plus this hackathon's stated requirements. Compare them with the live form once and adjust.

## 0. Facts used (all verifiable in the repo and live URLs)

| Fact | Source |
| --- | --- |
| Web app and seller flow | <https://wovain.com> |
| ChatGPT app (MCP server) | <https://mcp.wovain.com/api/mcp> (also served at `https://wovain.com/api/mcp`) |
| Docs (en, fr, es) | <https://docs.wovain.com> |
| Dev environment | <https://dev.wovain.com> |
| Public repo, MIT license | <https://github.com/sami-m-g/wovain> |
| Planning docs | `docs/scope.md`, `docs/prd.md`, `docs/spec.md`, `docs/app-map.html` |
| First commit | 2026-10-06 (inside the 2026-09-22 to 2026-10-26 period) |
| No sales, users, revenue or testimonials exist | `docs/scope.md > Explicitly Cut` |

## 1. Devpost form fields

### Project title

wovain

### Elevator pitch (tagline)

Idea to paused Meta ad campaign, one approval at a time.

(55 characters; Devpost allows 60.)

### Project story ("About the project")

**Inspiration**

A solo print-on-demand seller with a Fourthwall shop spends five tools on one t-shirt: guessing what will sell, a chat for the art, a manual upload, a separate ad tool and a hand-built campaign in Ads Manager. I wanted to see whether one agent could run that whole loop while the seller only approves decisions and keeps control of the money.

**What it does**

The seller gives a seed (a niche, a fandom, a product type) on the website or in ChatGPT.

1. Qloo's taste graph says who would buy and what else they love.
2. Tavily searches the past week's news inside those themes (why now) and checks how crowded the marketplaces are, keeping the source links.
3. Wovain returns ranked ideas with the evidence and score inputs behind each.
4. For the chosen idea it writes a brief and listing, draws transparent print art, and prices the shirt from the blank's base cost.
5. NVIDIA Nemotron on Nebius Token Factory judges the design (ready or revise, a score, up to five fixes). Code checks the print size itself and overrides the model.
6. The seller approves or rejects. An approved design becomes a Fourthwall product, hidden until the seller publishes it.
7. Nemotron writes up to three ad variants and wovain stages a Meta campaign, ad set and ads, always paused, for the countries and daily budget the seller chose.

An autopilot mode runs steps 2 to 7 in one go with Nemotron deciding, but only inside gates that code enforces: a design the judge says to revise is never approved, the price keeps at least $10 profit and a 30% margin, the daily budget stays between $1 and $500, and nothing is ever activated. The same steps are available as tools in a ChatGPT app.

**How we built it**

I started from an empty folder and used the Devpost Learn Skill Pack in Claude Code: interview, scope, PRD, spec, then build in slices and ship. The approved `scope.md`, `prd.md` and `spec.md` are in the repo.

One Next.js 16 app (App Router) on Google Cloud Run serves the website, an oRPC API and an MCP server, so the website and ChatGPT call the same procedures. Better Auth handles sign-in and is the OAuth server for ChatGPT; seller tokens for Fourthwall and Meta are sealed with AES-256-GCM. Drizzle and PostgreSQL on Cloud SQL store runs, ideas, designs, products and campaigns. Qloo, Tavily, Nemotron on Nebius, fal for the art, and the Fourthwall and Meta Ads MCP servers are existing services, wired together rather than rebuilt. The UI uses shadcn/ui on Base UI and Tailwind CSS 4, logs are evlog wide events, and the docs are a Fumadocs site. After deploy, three GitLab Duo flows (self-healing, scout, developer) watch the repo.

**Challenges**

- Deciding what the model may decide. The rule I settled on: models suggest, code guarantees. Print size, price floor, budget range and the paused state are code, covered by tests, not model output.
- Making a missing key or provider failure fail only its own step, with an error that names the problem, and recording the step and error on the run.
- Giving a seller fully server-side access to Fourthwall and Meta through their MCP servers with per-seller OAuth. Meta app review scope for server-side campaign creation is still an open item (see `docs/prd.md > Open Questions`).
- Keeping the proof of concept small: one product (t-shirt), JSON tool results in ChatGPT instead of widgets, no optimizer.

**Accomplishments that we're proud of**

- The loop works end to end on the live site and in ChatGPT: seed in, approved Fourthwall product and paused Meta campaign out.
- Every spending decision stays with the seller: nothing is activated by wovain.
- Ideas show their evidence (signals, source links, score inputs) instead of a bare ranking.
- Scope, PRD and spec written before the code, and the docs site and README kept in step with them.

No users, sales or revenue to report: there are none yet.

**What we learned**

- Planning before building, with the AI interviewing me, kept the project from sprawling. Cutting the optimizer, TikTok and a custom media-buying engine early made the rest finishable.
- The difference between a model suggesting a value and code guaranteeing it, and where each belongs.
- Reusing existing services (Fourthwall, Meta, Qloo, Tavily, Nebius) is faster and safer than rebuilding them.

**What's next**

- An optimizer that reads campaign results and proposes changes, once there is spend data.
- TikTok Shop and TikTok ads.
- Campaign results inside chat, and widgets in ChatGPT instead of JSON.
- More products than the t-shirt, trademark screening and a spend cap for autopilot.
- Idea-score weights recalibrated from real sales, if and when there are any.

### Built with (tags)

`typescript`, `nextjs`, `react`, `tailwindcss`, `shadcn-ui`, `orpc`, `better-auth`, `drizzle-orm`, `postgresql`, `google-cloud-run`, `google-cloud-sql`, `pulumi`, `model-context-protocol`, `chatgpt`, `claude-code`, `nvidia-nemotron`, `nebius-token-factory`, `qloo`, `tavily`, `fal`, `fourthwall`, `meta-ads`, `fumadocs`, `gitlab-duo`, `zod`, `posthog`

(Trim to what Devpost accepts. Check any tag you are not sure is in the shipped code, for example `posthog`, before using it.)

### "Try it out" links

- Live app: <https://wovain.com>
- ChatGPT app (MCP server URL to add as a connector): <https://mcp.wovain.com/api/mcp>
- Docs: <https://docs.wovain.com>
- Public repository (MIT): <https://github.com/sami-m-g/wovain>
- Planning docs: <https://github.com/sami-m-g/wovain/blob/main/docs/scope.md>, `.../docs/prd.md`, `.../docs/spec.md`

### Video demo link

YouTube or Vimeo, public or unlisted-but-viewable (the rules require this, not a file upload). URL: **to be added after upload.**

### Testing instructions (for the "additional info" box, if the form has one)

Judges will not clone the code. To try it: open <https://wovain.com>, sign up with email and password, connect Fourthwall and Meta on the connections page, enter a seed and follow the flow. Without a Fourthwall shop and a Meta ad account the flow stops at the connection step. In ChatGPT, add a connector with `https://mcp.wovain.com/api/mcp`, sign in and approve access. Every Meta object is created paused. Provide a test account here only if you create one for judges; do not paste real credentials into the repo.

### Other form items

- Team: Mina Sami (sami-m-g). Representative: same.
- Image gallery: 3 to 5 screenshots from the shot list below (ideas with evidence, design with judge verdict, approval, paused campaign), plus the architecture diagram from `docs/prd.md`.
- Exit survey: answer yourself, in your own words.

## 2. Video script (target 2:30, hard cap 3:00)

Rules to respect: under 3 minutes, on YouTube or Vimeo, no copyrighted music, and no third-party trademarks or copyrighted material without permission. The Fourthwall and Meta pages below show those companies' logos; keep those shots short and consider cropping to the product and campaign list, or confirm you are comfortable under their terms. Judges also read "does the video clearly demonstrate the project working end to end", so keep the real flow on screen. Record a screen capture of a real run (pre-run once so the slow steps are ready, or cut the waiting). The UI is being redesigned, so the shots describe it generically: use whatever the page looks like at recording time.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00 to 0:12 | Title card "wovain", then <https://wovain.com> home page | "Hi, I'm Mina. Selling one print-on-demand shirt usually takes five tools. This is wovain: it takes a seller from an idea to a ready, paused ad campaign, and you only approve." |
| 0:12 to 0:25 | Signed-in dashboard on wovain.com; connections page showing Fourthwall and Meta connected | "I sign in and connect my Fourthwall shop and my Meta ad account. Wovain never spends anything on its own, and I'll show you that at the end." |
| 0:25 to 0:40 | Seller flow: type a seed (a niche or fandom), choose target countries and a daily budget, start | "I type a seed: a niche I'd like to sell to. I also choose the countries and a daily budget up front." |
| 0:40 to 1:05 | Ideas list with each idea's taste signal, moment signal, source links and score inputs; open one idea's evidence | "First, Qloo's taste graph tells wovain who loves this and what else they love. Then Tavily searches this week's news inside those themes, so each idea has a taste signal, a why-now signal and its sources. I can see exactly how it was ranked." |
| 1:05 to 1:35 | Pick an idea; design appears on a Fourthwall t-shirt with price, profit and margin; Nemotron verdict, score and fixes | "I pick an idea. Wovain writes the brief, draws the print art and prices the shirt from the blank's real cost. Then Nemotron, running on Nebius Token Factory, judges the design: ready or revise, a score, and fixes. The print-size check is done by code, not the model, so the model can't talk its way past it." |
| 1:35 to 1:50 | Click Approve (optionally show a reject-with-reason field); Fourthwall shop page showing the new product | "I approve it. The product now exists in my Fourthwall shop, hidden until I choose to publish it." |
| 1:50 to 2:05 | Ad variants (angle, headline, message), then the campaign summary showing paused status | "Nemotron writes up to three ad variants. I approve them, and wovain stages a Meta campaign." |
| 2:05 to 2:15 | Meta Ads Manager campaign list, campaign visibly Paused, with the chosen countries and budget | "Here it is in Meta Ads Manager: the campaign, the ad set and the ads, all paused, in the countries I picked. I start it when I'm ready." |
| 2:15 to 2:28 | ChatGPT: the wovain app added via `https://mcp.wovain.com/api/mcp`; type "research trends for <seed>"; tool results appear | "The same flow also lives in ChatGPT. Same steps, same rules, because the website and ChatGPT call the same API." |
| 2:28 to 2:40 | Autopilot toggle or `start_run` with autopilot, then the repo page at <https://github.com/sami-m-g/wovain> showing `docs/scope.md`, `prd.md`, `spec.md`; docs site <https://docs.wovain.com> | "There's also an autopilot mode where Nemotron decides, inside gates that code enforces. I built this from an empty folder with the Devpost Learn skills, so the scope, PRD and spec are in the public repo. Thanks for watching." |

Total runs about 2:40; to land at 2:30, trim the countries/budget shot and the ChatGPT typing. Do not go past 3:00.

Recording checklist:

- Use a fresh browser profile with no personal tabs, bookmarks, notifications or password-manager popups.
- Use a test shop and test ad account; blur or avoid account IDs and any emails you do not want public.
- Show only real results from a real run. No invented sales, users or ratings, and do not describe the output as "selling".
- Add English captions (the rules want English materials).
- Upload to YouTube or Vimeo, then open the link in a private window to check it plays without login.

## 3. Pre-submit checklist

Mark each when verified, not before.

| Requirement (rules or `6-ship`) | Proof | Status |
| --- | --- | --- |
| Joined the hackathon on Devpost | <https://learn-ai-basics.devpost.com/> | To do (account action) |
| New project started from an empty folder during the submission period (2026-09-22 to 2026-10-26) | First commit 2026-10-06 (`55d9e69`), skills installed 2026-10-19 (`8bdfde3`); <https://github.com/sami-m-g/wovain/commits/main/> | Met |
| Built with the Devpost Learn Skill Pack | `.agents/skills/1-start` to `6-ship` in the repo | Met |
| `scope.md`, `prd.md`, `spec.md` in the public repo | `docs/scope.md`, `docs/prd.md`, `docs/spec.md` on GitHub `main`; each has `status: approved` | Met |
| App map | `docs/app-map.html` | Met |
| Public repo on GitHub, GitLab or Bitbucket | <https://github.com/sami-m-g/wovain> (public, checked via `gh`) | Met. Open it in a private window to confirm. |
| Open-source license, detectable at the top of the repo | `LICENSE` (MIT, GitHub detects it) | Met |
| Setup instructions and placeholder env vars, no real secrets | `README.md > Quick start`, `docs/spec.md`, `apps/web/.env.schema`; scan history for secrets before submitting | Verify |
| Working proof of concept doing one thing end to end | Live <https://wovain.com> and <https://mcp.wovain.com/api/mcp> | Met if one full real run succeeds before recording |
| Demo video, 1 to 3 minutes (rules: under 3), on YouTube or Vimeo, public, no copyrighted music or third-party trademarks | Section 2 above | Missing: not recorded or uploaded yet |
| Video URL and live demo URL recorded in the repo | `README.md` line "Demo: URL placeholder" and `docs/spec.md` "Video URL: to be added" | Missing: update both after upload |
| Project name, description, built-with, links filled in | Section 1 above | Draft: rewrite in your own words, then paste |
| Exit survey completed | Devpost submission flow | To do (yours to answer) |
| Materials in English | All docs in this pack are English | Met |
| Project free to test, access instructions given | Testing instructions in section 1 | Verify a judge can sign up and reach the flow without a Fourthwall or Meta account, or say what they need |
| Submit before 2026-10-26 17:00 EDT | Devpost project page | To do |

Known risks to settle before submitting:

- The 6-ship skill's rule that the learner writes the submission copy (see the note at the top).
- Meta app review scope for server-side campaign creation is an open item in the PRD and spec; confirm the live demo works for the account you record with.
- The `devpost/` folder the skills expect (`learner-profile.md`, `checklist.md`) is not in the repo; the planning docs live in `docs/`. This is fine for the rules (they only name the three files) but mention it if a reviewer asks.
- A UI redesign is merging; re-record or re-check screenshots after it lands.
