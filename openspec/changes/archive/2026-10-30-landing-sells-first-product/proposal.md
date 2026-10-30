# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/362

## Why

The landing page still told the brief-first story for independent labels ("One sentence. A whole drop."). The product now starts from what sells: Home suggests ideas with evidence, a pick opens at Designs with its research done, and the seller approves the design, publishes to Fourthwall and approves a campaign built paused on Meta. The audience is anyone with no experience who wants a first product selling. The page has to sell that, in the order the app runs it, without claiming results nobody has seen yet.

## What Changes

- Hero: one promise ("From idea to a live product and its ads in under an hour"), a supporting line, three points (no design skills, no inventory, you approve every dollar of ad spend), one primary call to action ("Find my first product", sign-up) and the free credits under it.
- Hero demo: re-scripted to today's flow. Home's idea card (what to make, why it sells, who buys, competition) and "Start this drop"; Designs with the research report, tone and colours and "Make designs"; Nemotron, fal and the vision check ticking off; four designs with print scores and one approved; the product published to Fourthwall with its price math; an image ad and a video ad for the idea's Qloo audience beside the spend rules (daily cap, monthly cap, $50 loss limit, mirrored as Meta automated rules), built paused.
- Sections: how it works in five steps, proof (the evidence behind each idea, and the spend rules), the accounts to connect, pricing from the billing catalog (Free now, Studio and Label coming soon), an eight-question FAQ for first-time sellers and the closing call to action. The results section with example Insights is removed: it read as live results.
- SEO title, description and Open Graph copy rewritten; header call to action becomes "Start free".
- en, es and fr changed together.

## Capabilities

### Modified Capabilities

- `marketing-site`: positioning, the hero and its demo, and the sections after the hero.

## Impact

`apps/web` landing route, marketing components and messages; `NotifyButton` gains a `home` surface. No new dependencies.
