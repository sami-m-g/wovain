// The campaign step, as the agent follows it. Served by get_playbook and as an MCP prompt.
export const campaign = {
  description:
    'Build and launch the merchant\'s one Meta Advantage+ sales campaign from the ad concepts they approved, with wovain\'s five automated rules. Use when the merchant says "Run it" or "Create the campaign", and when a chat message says "I\'m confirming the wovain campaign launch in my browser", "Launch the wovain campaign" or "I fixed the campaign blockers, check again".',
  text: `One Advantage+ sales campaign holds every approved ad concept. It's built as a Meta draft, so nothing spends until the merchant presses **Launch** on the campaign widget. Every Meta Ads call needs \`advertiser_job: "create_and_launch_new_ads"\` and the same \`client_conversation_id\`.

## Which Meta tools

wovain reaches the merchant's Meta account itself:

- **Reads** (accounts, Pages, pixels, drafts, videos, previews): wovain \`meta_ads\` with \`tool\` = the Meta tool name below and \`arguments\` = its arguments.
- **Draft objects** (uploads, campaign, ad set, creatives, ads): wovain \`campaign_draft\` with \`tool\` and \`arguments\` the same way, using only the arguments listed in step 4 (it refuses any other key, any link that isn't a planned product link, and any image hash or video ID it didn't upload). Meta stages each object paused; wovain sets the campaign budget from the plan and hides Meta's widgets.
- **Publishing**: wovain \`launch_campaign\`, which works only after the merchant confirmed the launch on wovain's confirm page in their own browser (the widget's Launch button opens it; \`request_launch\` makes the link).

If \`meta_ads\` answers with \`needsConnection\`, show the merchant the link and wait until they say they're done. Until wovain's Meta app passes Meta's App Review, only people with a role on that app can connect. If the merchant can't connect, or \`meta_ads\` says wovain's Meta app isn't set up, use the host's own Meta Ads connector for every \`ads_*\` call below instead (pass \`hide_ui: true\` on its create and upload calls), and launch with its \`ads_activate_entity\` on the campaign with \`publish_as_active: true\`. Rules then need the merchant's Meta connection to wovain; without one, add a blocker for them.

## Build the campaign ("Run it")

1. **Plan.** wovain \`campaign_plan\`. It returns the campaign name, the daily budget in cents, \`urlTags\` (absent when the merchant turned tagging off), and per product: link, static image and \`ads\`, one per approved concept, each with its \`adName\`, \`images\` and \`videos\` (with ratios), up to 5 \`primaryTexts\` and 5 \`headlines\`, the \`cta\`, \`aiMade\`, and \`cards\` for a carousel.
2. **Check the account.** \`ads_get_ad_accounts\` (the ad account, \`has_payment_method\`), \`ads_get_ad_account_pages\` (the Page), \`ads_get_datasets\` (the pixel). A personal ad account often has no Page linked: then use \`ads_get_user_pages\` and take a Page the merchant can advertise with (ask which if there are several). Note each problem as a blocker with a plain fix:
   - No payment method → "Add a payment method in Meta Billing, then check again." with \`https://business.facebook.com/billing_hub/payment_settings\`.
   - No Page in either list, or no pixel → say which and where to create it in Meta Business Suite. Without a Page or pixel, skip to step 6 as blocked. A missing payment method doesn't stop the build; it only blocks Launch.
3. **AI label.** When any ad has \`aiMade\`, ask once: "Some visuals were made with AI on fal. Meta can label those ads as AI-made. Label them?" Use the answer as \`self_ai_disclosure\` (\`OPT_IN\` or \`OPT_OUT\`) on every creative with \`aiMade\`, and \`OPT_OUT\` on the others. Don't decide it for the merchant.
4. **Build the draft** with \`campaign_draft\`:
   - Each image the ads use (every \`images\` URL, every card's \`imageUrl\`, and the static image once): \`ads_creative_upload_media\` with \`upload_source: "URL"\`, \`media_type: "IMAGE"\` and the URL; keep each \`image_hash\`. Creatives take only these hashes, never \`image_url\`.
   - Each video: \`ads_creative_upload_media\` with \`media_type: "VIDEO"\` and the video URL; wait with \`ads_get_ad_videos\` (through \`meta_ads\`) until \`ready\`.
   - Campaign: \`ads_create_campaign\`, \`objective: "OUTCOME_SALES"\`, \`buying_type: "AUCTION"\`, \`campaign_daily_budget\` from the plan.
   - One ad set: \`ads_create_ad_set\`, \`optimization_goal: "OFFSITE_CONVERSIONS"\`, \`billing_event: "IMPRESSIONS"\`, \`destination_type: "WEBSITE"\`, \`promoted_object: {"pixel_id": "<pixel>", "custom_event_type": "PURCHASE"}\`, \`targeting: {"geo_locations": {"countries": ["US"]}}\` (Advantage+ audience and placements stay on).
   - Each ad, by shape, with \`ads_create_creative\`. Every creative gets \`page_id\`, \`link_url\` = the product link (+ \`?\` + \`urlTags\` when the plan has them), \`call_to_action_type\` = the ad's \`cta\`, \`self_ai_disclosure\`, and \`name\` = its \`adName\`:
     - **2 or more visuals** (images and videos together): \`multi_media\` with one entry per visual (\`{"image_hash": "..."}\` or \`{"video_id": "..."}\`), plus \`primary_texts\` and \`headlines\` (all the variants). Meta picks the visual per placement and tests the text.
     - **One image**: \`image_hash\`, \`message\` = the first primary text, \`headline\` = the first headline.
     - **One video**: \`video_id\`, the static image's \`image_hash\` as the thumbnail, and \`message\` = the first headline on its own line, then the first primary text. Don't pass \`headline\` or \`description\` on a single-video creative: the connector maps them to the call-to-action link title and description, which Meta has retired, and every placement fails to preview.
     - **Carousel** (\`cards\`): \`cards\` with each card's \`image_hash\`, \`headline\` and \`link\` (that card's product link, + \`?\` + \`urlTags\`), and \`message\` = the first primary text. \`link_url\` is the first card's link.
   - Then \`ads_create_ad\` with the ad's \`adName\` and \`{"creative_id": "..."}\`.
5. **Rules.** wovain \`create_rules\` with the ad account ID and the campaign ID that \`campaign_draft\` staged (it refuses any other). If it answers with \`needsConnection\` or says wovain's Meta app isn't set up, add that as a blocker with its fix.
6. **Widget.** wovain \`show_campaign_widget\` with \`status: "ready"\` (or \`"blocked"\` with the blockers), the ad account ID and the campaign ID. Say one line: what's built and that nothing spends until Launch. Then stop and wait.

## "I'm confirming the wovain campaign launch in my browser"

The merchant pressed Launch, and wovain's confirm page opened in their browser. Wait until they say they confirmed (if they lost the page, \`request_launch\` gives the link again). Then:

1. wovain \`launch_campaign\`. It refuses if they haven't confirmed, or if the draft no longer matches the plan; say so and stop.
2. Read back with \`ads_get_ad_entities\` (live) through \`meta_ads\`. If published, wovain \`show_campaign_widget\` with \`status: "live"\`. If Meta refused (most often the payment method), \`status: "blocked"\` with Meta's reason as the issue and its fix.

## "Launch the wovain campaign"

Only when the merchant uses the host's Meta Ads connector (the widget sends this message then). The merchant pressed Launch, which is their go-ahead to spend.

1. \`ads_get_ad_entities\` with \`object_state: "draft"\` and the campaign ID to collect the campaign, ad set and ad IDs.
2. \`ads_activate_entity\` on the campaign with those \`object_ids\` and \`publish_as_active: true\`.
3. Read back as above.

## "I fixed the campaign blockers, check again"

Run the account checks again, finish any build step that was skipped, call \`create_rules\` again (it skips rules that exist), and redraw the widget as \`ready\` or still \`blocked\`.

If a draft ad has a broken creative (Meta's preview names a creative error), make a fixed creative with \`campaign_draft\`, then create a replacement ad with the same name and leave the broken one unpublished.

## Rules

- Never publish or activate without the merchant pressing Launch. On wovain's path, only their confirmation on wovain's page counts, never a chat message.
- One campaign per run; never create a second one for the same ads. If a draft campaign already exists from this run, reuse it.
- Don't change the budget, country or optimization goal from the plan unless the merchant asks.
`,
};
