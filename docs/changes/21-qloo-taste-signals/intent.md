# Intent: Qloo taste signals drive trend research and Meta targeting

Issue: #21

## Problem

> Build the Qloo integration for wovain now, ahead of the key. The Qloo hackathon (qloo.devpost.com, deadline Oct 30) requires Qloo to be central.

> have products that sell.

`research_trends` reads only this week's news (Tavily). Its ideas know what's happening, but not who would buy, how crowded the market already is, or whether anyone pays to advertise the theme. The campaign step has no audience input: it targets the whole US.

## Desired outcome

Taste × moment. Qloo says who the audience is and what else they love. Tavily says why now.

- `research_trends` starts from the seed's Qloo taste graph: the seed's entities (`/search`), their cross-domain taste tags (`/v2/insights`, `filter.type=urn:tag`) and the seed's velocity (`/v2/trending`). Tavily then searches the past week's news only inside those themes, and checks how crowded each theme is on Etsy, Redbubble and Amazon.
- Ideas are scored in code on sales likelihood: demand (Qloo affinity, plus active Meta ads when the agent passes them), momentum (news this week, discounted when Qloo's velocity doesn't confirm it), low saturation (few marketplace matches) and IP safety (no Qloo brand, artist or title names). Nemotron writes only the idea's name, angle and moment line.
- Each idea shows both signals (`taste`, `moment`), the top 3 competitor listings, and the inputs behind its score, so real sales can recalibrate the weights later.
- `suggest_audience` turns a chosen idea's Qloo tags into a Meta audience suggestion: age bands and gender (`urn:demographics`) and the top locations (`urn:heatmap`). The campaign playbook offers it to the merchant.
- If the host agent has the Meta Ads MCP, the design playbook counts active ads per theme with `ads_library_search` and passes them back to `research_trends`.

## Constraints

- `QLOO_API_KEY` is optional. Without it, `research_trends` works as today and says Qloo isn't configured; `suggest_audience` says it isn't set up.
- Hackathon keys work only at `https://hackathon.api.qloo.com` with the `X-Api-Key` header.
- Inputs are bounded, Qloo and web results are marked untrusted, and no query text reaches the logs.
- Tests mock Qloo. One opt-in live test skips without the key.
- No server-side Meta client: it waits on Meta app review (#19).
- Don't touch `lib/connections.ts`, `lib/upstream.ts` or `routes/connect.ts` (another branch).

## Open questions

- Qloo spending-habit audiences (`/v2/audiences`) as a demand signal need the key to list audience IDs. Follow-up.
- Recalibrating the weights from real Fourthwall sales and Meta results. Follow-up.
