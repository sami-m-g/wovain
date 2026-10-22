# Verify: Autopilot, one command from idea to a paused Meta campaign

## Tests added

- `apps/server/test/integration/autopilot.test.ts` (emulators, with Nemotron, the judge, Tavily and the merchant's fal stubbed):
  - **Starting:** a run needs the opt-in, the same `runKey` returns the same run, and only one run runs at a time. Turning autopilot off stops every decision.
  - **Cost cap:** a job that would pass $5 stops the run. Videos are refused on a run without them, and any paid job is refused while the operator switch is off. Work outside a run isn't counted.
  - **Idea:** themes with trademark hits never reach the model, and the pick is logged.
  - **Ads:** at most three concepts are approved, one per angle, and copy with a price is never approved. A design the run didn't decide can't have its ads approved.
  - **Design:**
    - a ready design is approved with the run's id, so it publishes hidden;
    - a design made before the run is refused;
    - a change while it's judged voids the approval;
    - a run stopped, or autopilot turned off, while the judge runs writes no approval;
    - art the run didn't make is refused;
    - when OCR reads words the piece didn't declare, approval is refused (OCR is charged to the run);
    - a trademark hit drops the design without asking the judge;
    - every product's title, its description's lead phrase and the art's declared words are screened, and a phrase the screen can't check refuses approval;
    - a price under the floor goes back for revision, and revisions stop after 2;
    - a dropped design is never decided again, and every decided design counts toward the 3-design cap.
  - **Paid fal tools:**
    - `generate_art` sends each piece as its own job, records it with its declared words, charges the run, and refuses pieces without `text`;
    - `generate_videos` is refused without videos;
    - `generate_videos` and `add_video_audio` charge the run before sending;
    - the agent can't set a design's `run` or `hidden`, and a redraw keeps them.
  - **Over MCP:** the operator switch and the opt-in gate `autopilot`, and no tool can approve.
- `apps/server/test/integration/confirm.test.ts`: the merchant turns autopilot on only by confirming its terms on the confirm page.
- `apps/server/test/unit/publish-design.test.ts`: an autopilot approval creates the products and collection hidden, and go live makes exactly those public.
- `apps/server/test/unit/autopilot-art.test.ts`:
  - the image prompt forbids any text beyond the declared words;
  - OCR's reading is found wherever fal puts it;
  - the launch snapshot pins the exact hidden drops.
- `apps/server/test/integration/playbooks.test.ts`: the autopilot playbook is served.

## Checks run

All pass on the branch, rebased on main with !47 and !48:

- `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`;
- `pnpm test` (server 192, ops 71);
- `pnpm test:integration` (204);
- `pnpm test:stories` (41);
- `pnpm build`.

## Review findings

A security review ran on each revision of the branch. Every finding was fixed, with a test:

- **Cost cap bypass in the ad tools.** Every paid fal submit (`generate_art`, `generate_ad_images`, `generate_videos`, `add_video_audio`) and the OCR read charge the run before sending, and the operator switch reaches them.
- **Trademark screen too narrow.** It now covers every product's title and lead phrase plus each artwork's declared words. It refuses approval when it can't check one.
- **Printed text trusted to the agent.** The first fix used regexes over the prompt; the review rejected that. Now:
  - each art piece is its own fal job, recorded in the run with its declared words;
  - approval needs every artwork URL to be one of the run's job results;
  - OCR on fal (`fal-ai/florence-2-large/ocr`, through the merchant's fal) reads each image, and words the piece didn't declare refuse approval.
- **A dropped design could be decided again.** Dropped designs are recorded and refused, and every decided design counts toward the cap.
- **Scope.** A design belongs to the run it was made in. The store stamps it; the agent can't set it, and redraws keep it.
- **Change between judging and approval.** The approval rechecks, in one transaction, a hash of everything judged, and that the run and the opt-in are still current.
- **Go live.** The launch snapshot pins the exact hidden designs, offers and collections. `launch_campaign` makes only those public.

## Try it

1. In ChatGPT with wovain connected (with Fourthwall and fal connected through wovain), say: "create a t-shirt for me on autopilot".
2. The agent shows the opt-in link. Sign in and confirm the terms.
3. The agent researches, designs, publishes the products hidden, makes ad concepts and stages the paused campaign. `autopilot_status` lists every decision and the fal spend.
4. Press Launch on the campaign widget. The confirm page names the hidden products; confirming makes them public and starts the campaign.

## Not verified live

No live run has been done. Still unverified:

- Nemotron's replies to the idea and ads prompts.
- A real GPT Image 2.5 charge against the cap. Spend is counted at list-price estimates: art $0.10 a piece, OCR $0.01 an image.
- The fal MCP `run_model` reply shape for Florence-2 OCR, and how well it reads stylized lettering. OCR noise refuses approval, so a false reading fails closed.
- A real Fourthwall hidden publish and go live.
- wovain checks that each design's artwork URL is the run's fal image. It doesn't yet check that the Fourthwall media-library copy used for the mockups holds the same bytes.

## Departures from the plan

See `plan.md > As built`:

- There's no Cloud Tasks runner: the host runs the playbook and the decisions run on the server.
- There's no run-status widget.
- The idea decision uses today's `research_trends`. !46 (Qloo) hadn't merged, so its signals need a small follow-up once it lands.
