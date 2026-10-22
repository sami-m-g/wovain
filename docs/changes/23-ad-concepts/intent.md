# Intent: distinct Meta ad concepts per product

Issue: #23

## Problem

> after the merchant approves a product set, wovain creates beautiful Meta ads that SELL. Today it's a template that makes the same ad for everything.

Every product gets the same ad: two UGC clips, the mockup, one headline and one primary text. Nothing ties the ad to who buys or why now, there's one format (9:16 video), no text variants for Advantage+ to test, and feedback can only redo the whole widget.

## Desired outcome

- 2 to 4 distinct ad concepts per product, each with its own hook and angle built from the research signals: Qloo taste (who), Tavily news (why now), competitor gaps (Meta Ad Library).
- Formats: Feed 1:1 or 4:5, Stories and Reels 9:16, and a carousel across the product set.
- Primary text, headline and CTA variants for Advantage+ creative testing.
- Visuals: lifestyle and mockup images generated on the merchant's fal connection, Fourthwall mockups, optional short video.
- Per-concept feedback ("more playful", "use the back print") returns a revised concept.
- With no ad idea from the merchant, wovain proposes its own.
- "Run it" or "Create the campaign" builds the campaign paused with every approved concept.

## Constraints

- Keep the code small: the host model does the creative work through prompts and playbook guidance; generation goes through the merchant's fal connection (`lib/upstream.ts`).
- The campaign is built paused; nothing spends until the merchant presses Launch.
- Follow Meta's current specs from first-party pages: text limits, ratios, carousel cards, AI-content disclosure.
- Stories for each widget state, light and dark.
- Don't touch `tools/design.ts`, `playbooks/design.ts`, the design widget, the connections files or the Meta files. Another agent may edit the campaign code, so changes there stay small.
- Stored ad records change shape and there are no migrations, so old records must still read.

## Open questions

None blocking. The owner waived the plan checkpoint and asked for the build.
