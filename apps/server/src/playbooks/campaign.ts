// The campaign step, as the agent follows it. Served by get_playbook and as an MCP prompt.
export const campaign = {
  description:
    'Build and launch the merchant\'s one Meta Advantage+ sales campaign from the ad cards they added, with wovain\'s five automated rules. Use after the last ad card is added or skipped, and when a chat message says "Launch the wovain campaign" or "I fixed the campaign blockers, check again".',
  text: `One Advantage+ sales campaign holds every added ad. It's built as a Meta draft, so nothing spends until the merchant presses **Launch** on the campaign card. Every Meta Ads call needs \`advertiser_job: "create_and_launch_new_ads"\` and the same \`client_conversation_id\`.

## Build the campaign (after the last ad card)

1. **Plan.** wovain \`campaign_plan\`. It returns the campaign name, the daily budget in cents, and per product: link, headline, primary text, static image, finished videos with their ad names, and \`urlTags\`.
2. **Check the account.** \`ads_get_ad_accounts\` (the ad account, \`has_payment_method\`), \`ads_get_ad_account_pages\` (the Page), \`ads_get_datasets\` (the pixel). A personal ad account often has no Page linked: then use \`ads_get_user_pages\` and take a Page the merchant can advertise with (ask which if there are several). Note each problem as a blocker with a plain fix:
   - No payment method → "Add a payment method in Meta Billing, then check again." with \`https://business.facebook.com/billing_hub/payment_settings\`.
   - No Page in either list, or no pixel → say which and where to create it in Meta Business Suite. Without a Page or pixel, skip to step 6 as blocked. A missing payment method doesn't stop the build; it only blocks Launch.
3. **AI label.** Ask once: "Meta can label these ads as made with AI. Label them?" Use the answer as \`self_ai_disclosure\` (\`OPT_IN\` or \`OPT_OUT\`) on every creative. Don't decide it for the merchant.
4. **Build the draft.** Pass \`hide_ui: true\` on every Meta create and upload call, so the chat shows wovain's campaign card instead of one Meta widget per object.
   - Each video: \`ads_creative_upload_media\` with \`upload_source: "URL"\`, \`media_type: "VIDEO"\`, the video URL; wait with \`ads_get_ad_videos\` until \`ready\`.
   - The static image once: \`ads_creative_upload_media\` with \`media_type: "IMAGE"\`; keep its \`image_hash\` for the video thumbnails.
   - Campaign: \`ads_create_campaign\`, \`objective: "OUTCOME_SALES"\`, \`buying_type: "AUCTION"\`, \`campaign_daily_budget\` from the plan.
   - One ad set: \`ads_create_ad_set\`, \`optimization_goal: "OFFSITE_CONVERSIONS"\`, \`billing_event: "IMPRESSIONS"\`, \`destination_type: "WEBSITE"\`, \`promoted_object: {"pixel_id": "<pixel>", "custom_event_type": "PURCHASE"}\`, \`targeting: {"geo_locations": {"countries": ["US"]}}\` (Advantage+ audience and placements stay on).
   - Each video: \`ads_create_creative\` with the Page, \`video_id\`, the static image's \`image_hash\` as the thumbnail (never \`image_url\`: Meta rejects a video creative that ends up with both), \`link_url\` = product link + \`?\` + \`urlTags\`, \`call_to_action_type: "SHOP_NOW"\`, and \`message\` = the headline on its own line, then the primary text. Don't pass \`headline\` or \`description\` on video creatives: the connector maps them to the call-to-action link title and description, which Meta has retired, and every placement fails to preview. Then \`ads_create_ad\` with the plan's \`adName\` and \`{"creative_id": "..."}\`.
5. **Rules.** wovain \`create_rules\` with the ad account ID and the campaign ID. If it says the token is missing, add that as a blocker with its fix.
6. **Card.** wovain \`show_campaign_card\` with \`status: "ready"\` (or \`"blocked"\` with the blockers), the ad account ID and the campaign ID. Say one line: what's built and that nothing spends until Launch. Then stop and wait.

## "Launch the wovain campaign"

The merchant pressed Launch, which is their go-ahead to spend.

1. \`ads_get_ad_entities\` with \`object_state: "draft"\` and the campaign ID to collect the campaign, ad set and ad IDs.
2. \`ads_activate_entity\` on the campaign with those \`object_ids\` and \`publish_as_active: true\`.
3. Read back with \`ads_get_ad_entities\` (live). If published, wovain \`show_campaign_card\` with \`status: "live"\`. If Meta refuses (most often the payment method), \`status: "blocked"\` with Meta's reason as the issue and its fix.

## "I fixed the campaign blockers, check again"

Run the account checks again, finish any build step that was skipped, call \`create_rules\` again (it skips rules that exist), and redraw the card as \`ready\` or still \`blocked\`.

If a draft ad has a broken creative (Meta's preview names a creative error), make a fixed creative and point the ad at it with \`ads_update_entity\` (\`creative: {"creative_id": "..."}\`). If Meta won't allow that, create a replacement ad with the same name and leave the broken one unpublished; list only the working ads when you launch.

## Rules

- Never publish or activate without the merchant pressing Launch (or saying so in chat).
- One campaign per run; never create a second one for the same ads. If a draft campaign already exists from this run, reuse it.
- Don't change the budget, country or optimization goal from the plan unless the merchant asks.
`,
};
