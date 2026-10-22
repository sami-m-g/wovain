// The ads step, as the agent follows it. Served by get_playbook and as an MCP prompt.
export const ads = {
  description:
    'Make the ad widget for each product the merchant published with wovain — two short UGC-style videos with background audio, the mockup as a static, ad copy and the breakeven math. Use right after a design goes live, and when a chat message says "Added the ads for design dN", "Skipped the ads for design dN", "Feedback on the ads for design dN" or "Retry video X for design dN".',
  text: `One ad widget per published product: two videos, the mockup, a headline and primary text, and the numbers the campaign rules will use. Nothing reaches Meta here; the merchant adds or skips each widget, and the campaign launches after the last one.

## Make the ad widget (per live design)

1. **Plan.** wovain \`video_plan\` with the \`designId\`. It returns one ready fal request per clip, the background-audio request, the model, whether it keeps the print, and the estimated cost. Say the estimate in one line before spending, labeled as fal's list price ("Two clips with H3 Max Reference: about $1.53 at fal's list price; the actual charge can be higher.").
2. **Generate.** wovain \`generate_videos\` with the \`designId\`. It runs the planned clips on the merchant's own fal account and returns the job handles. Then wovain \`fal\` with \`tool: "wait_for_jobs"\` and those handles as \`arguments.jobs\`, until every job has an outcome. If a result has \`needsConnection\`, show the merchant its link, wait until they say it's done and call \`generate_videos\` again.
3. **Audio.** When the plan has \`audio\`, wovain \`add_video_audio\` with the \`designId\` and the finished clips' URLs, then wait for those jobs the same way. Use the returned videos' URLs from here on. If the plan has no \`audio\`, keep the clips' URLs.
4. **Copy.** Headline: short and product-led (≤ 40 characters). Primary text: 2 to 3 lines in the friendly-coach voice, one concrete detail of the design, no claims you can't back.
5. **Widget.** wovain \`show_ad_widget\` with the \`designId\`, the videos (\`slot\`, \`angle\` from the plan, \`seconds\`, \`status: "ready"\` and the clip's fal \`url\`; a clip that failed twice goes in as \`status: "failed"\` without a URL), the copy and one coach line ("Two try-on clips plus your mockup. Good margin for a test."). wovain adds the mockup, the breakeven math and the rule thresholds. Then stop and wait. If the merchant asks what fal actually charged, wovain \`fal\` with \`tool: "search_request_history"\` shows their recent requests.

When the plan says the model doesn't keep the print, add to the coach line that it's a test model and to check the print full screen.

## When the merchant acts on the widget

- **"Added the ads for design dN"** or **"Skipped the ads for design dN"**: the widget already recorded it. If other ad widgets are still waiting, say which, in one line. When none are waiting and at least one was added, start the \`campaign\` playbook. If every widget was skipped, say no campaign will launch.
- **"Feedback on the ads for design dN: …"**: redo only what the feedback touches (copy, one clip or both) and redraw with \`show_ad_widget\` for the same \`designId\`.
- **"Retry video X for design dN"**: generate that slot again from \`video_plan\`, add its audio, and redraw the widget with both slots.

## Rules

- Never launch, upload to Meta or spend ad budget from this playbook.
- Spend on video only after saying the estimate; one retry per failed clip, then show it as failed (the merchant can retry from the widget or go with the static image).
- Keep copy honest: no prices, discounts or claims the product page doesn't make.
`,
};
