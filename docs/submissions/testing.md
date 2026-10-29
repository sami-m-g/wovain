---
doc: submission
hackathon: Basics, GitLab Transcend, Nebius x NVIDIA, Qloo
status: draft
---

# Judge testing instructions for wovain

One shared judge account serves all four hackathons. Credentials and the judges' promo code go only into Devpost's private testing box, never into this repo (it is public). In this file they are the placeholders `<judge email>`, `<judge password>` and `<promo code>`.

Checked 2026-10-26 against each hackathon's official rules page, read in the browser.

## What the rules require

All four say the project must be free of charge and without restriction for testing until the Judging Period ends, and that a private site must put login credentials in the testing instructions. Judges are not required to test.

| Hackathon | Submission closes | Judging period ends | Keep the judge account working until |
| --- | --- | --- | --- |
| Build With AI: Basics | 2026-10-26 17:00 EDT | 2026-10-30 17:00 EDT | 2026-10-30 |
| GitLab Transcend | 2026-10-27 13:00 UTC | 2026-11-14 17:00 UTC; Path B also needs the deployed project live until winners, about 2026-11-16 | 2026-11-16 |
| Qloo Agentic | 2026-10-30 23:45 EDT | 2026-11-05 23:45 EDT | 2026-11-05 |
| Nebius x NVIDIA | 2026-10-30 10:00 PT | **2026-12-15 12:00 PT** | **2026-12-15** |

Heads-up: Nebius's judging period runs to 2026-12-15, not 2026-10-30. The account, the connected shop, ad account and fal account, and the credits must last until then. Free credits refresh monthly, and the judges' promo code adds 300 that never expire (see the checklist). The code works until 2026-12-16.

## 1. Paste-ready block for Devpost's testing-instructions field

Under 1,500 characters. Paste only this block.

```text
Live app: https://wovain.com (free, no payment needed)
Sign in with email and password: <judge email> / <judge password>
The account is pre-connected to a test Fourthwall shop, a Meta ad account and a fal account. Please do not change them.

5-minute path:
1. New drop: describe a drop, e.g. "retro surf club tees".
2. Review the ranked ideas and their evidence.
3. Pick an idea and its designs; see Nemotron's verdict and the price math.
4. Approve a design.
5. In the Fourthwall shop admin, see the new product, hidden.
6. Open the run: the Meta campaign is staged PAUSED (Meta Ads Manager shows the same).
7. Open Insights.

Safe: campaigns are always created paused, products are hidden, nothing spends money. A manual drop costs 6 credits; the account has enough for many. Autopilot is a paid feature and is off.

Your own account (optional): sign up, then Billing > Redeem a code > <promo code> for 300 free credits. No card needed.

Please do NOT turn a campaign on, publish a product, or disconnect or change connections.

ChatGPT app (optional): add a connector with https://mcp.wovain.com/api/mcp, sign in with the same account, approve access, then ask "research trends for retro surf tees".

Docs: https://docs.wovain.com
Contact: support@wovain.com
```

Check before pasting:

- Screen names (Overview, New drop, Runs, Connections, Insights, Billing) are the current English labels in `apps/web/messages/en.json`. Re-check if a redesign MR changes them (MR !111 sign-in and settings, MR !124 logo).
- "a fal account" is true only after MR !120 (fal through OAuth) merges. Until then art is drawn with the platform's fal key; delete "and a fal account".
- The sign-in line assumes email and password work on the live site (the code enables them, with email verification). Confirm in checklist step 1.
- The ChatGPT paragraph is optional. The MCP server signs in through Better Auth's own OAuth, so the judge account should work, but confirm in checklist step 6 or delete the paragraph.
- Contact `support@wovain.com` is the address in the site's terms page; swap it if you want a different one.
- `<promo code>` is the `judges-2026` code (checklist step 3 says where to read it). It is the only secret besides the password: paste it only into Devpost's private box. Each account can redeem it once, and it allows 50 redemptions in all.

## 2. Per-hackathon notes

Use where a form has an "additional info" or description field.

**Build With AI: Basics.** The planning docs are the point: `docs/scope.md`, `docs/prd.md`, `docs/spec.md` and `docs/app-map.html` in the public repo (<https://github.com/sami-m-g/wovain>), each written before the code with the Devpost Learn skills in `.agents/skills`. Then run the live loop with the judge account. The submission pack is [basics.md](basics.md). Judging ends 2026-10-30.

**GitLab Transcend (Path B, deployed on Google Cloud).** Look at the public GitLab project for what runs after code merges: the live Duo flows (self-healing, KPI scout, issue to completion; the vulnerability flow and deps review follow in their review MRs), with diagrams in [docs/flows.md](../flows.md). The proof timeline is the issues, merge requests and pipeline history on that project, where each flow's output (a heal MR, a scout issue, an auto-merged change) links back to its trigger. Feature flags are GitLab feature flags read through Unleash; flags as code, canary deploys and the Duo release guard arrive with MR !121, so describe them as shipped only after MR !121 merges. Today's shipped flag is `fault-injection-checkout`, the self-healing harness switch. The deployed app is the same wovain.com with the judge account, and it must stay live until winners are announced (about 2026-11-16).

**Nebius x NVIDIA.** NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`) runs on Nebius Token Factory at runtime through an OpenAI-compatible client in `packages/core/src/nemotron.ts`. It is used for the design brief and listing and the judge's verdict with score and fixes (`packages/api/src/flow/designs.ts`), the ad variants (`flow/campaigns.ts`), and autopilot's pick and review (`flow/runs.ts`); a judge sees these as the design verdict and the ad copy. Calls are traced as PostHog LLM traces per run. Code, not the model, enforces print size, price floor, budget range and the paused state. Tavily is also called at runtime for news and marketplace signals (the Tavily bonus needs a functional runtime call). Judging ends 2026-12-15, so keep the account funded until then.

**Qloo (free plan only).** Qloo's taste graph is the first step of every drop: `packages/core/src/qloo.ts` calls `/search` and `/v2/insights` to find who loves the direction and what else they love, and `packages/api/src/flow/ideas.ts` turns that into the themes Tavily searches and the idea ranking. Each idea shows its taste signal and score inputs. The key is the hackathon key; a judge needs nothing from Qloo. Judging ends 2026-11-05. Run one drop and open an idea's evidence to see Qloo's part.

## 3. Pre-flight checklist (yours, before submitting)

Do these in order. Tick each only after you saw it work.

1. **Create the judge account** at <https://wovain.com> with a dedicated email and a throwaway password. Use email and password, not Google, so a judge can sign in. Open the verification email and verify it: paid steps are refused with "Please verify your email first" until you do (`packages/api/src/flow/spend.ts`). Keep the credentials in a password manager, not in the repo.
2. **Connect the providers** while signed in as that account: Fourthwall (your shop), Meta (your ad account) and fal (your account, after MR !120 merges; until then the platform key draws the art). Use a shop and ad account you are happy for judges to use. Keep the ad account safe from charges: campaigns are always paused, but an account with no payment method is safest.
3. **Redeem the code on the judge account.** Free gives 25 credits a month, about four manual drops (6 credits each), and several judges over seven weeks need more. The `judges-2026` promo (`packages/billing/src/promos.ts`) adds 300 credits that never expire, about 50 drops, through a $0 Polar checkout. Its credits arrive by Polar's webhook like any purchase, so the ledger stays the only record.

   1. Read the code. The `polar:seed` job generated it at random and stored it only in Secret Manager; it is never in the repo or the job log. Run `gcloud secrets versions access latest --secret=polar-promo-judges-2026 --project=<gcp project>`, or open the Polar dashboard > Products > Discounts > "wovain Judges 2026".
   2. Signed in as the judge account, open Billing, enter the code under **Redeem a code** and select **Redeem**. No card is asked for: the code is 100% off, so wovain confirms the checkout itself.
   3. Within a few seconds, the page shows "Code redeemed" and **Credits left** goes up by 300.

   Each account can redeem a code once, and the code allows 50 redemptions in all, until 2026-12-16. Autopilot stays off, because it is gated by plan, not credits.

4. **Make one test run** as the judge account, end to end: describe a drop, pick designs, approve, then check the hidden product in Fourthwall and the run in Insights. Time it; the block promises 5 minutes.
5. **Confirm the campaign is paused.** In Meta Ads Manager for the connected account, the campaign, ad set and ads must all show Paused. If anything is on, pause it and do not submit until you know why.
6. **Test the ChatGPT option** if the block keeps it: add the connector `https://mcp.wovain.com/api/mcp` in ChatGPT with the judge account and run "research trends for retro surf tees". If it fails, delete that paragraph from the block.
7. **Paste the block** into Devpost's private testing box with the real email and password. Check that no real credentials appear in the repo, this file, or the public project description.

### Reset between judges

The account is shared, so judges will see each other's runs. Between judges, or daily while judging runs:

1. In Meta Ads Manager, confirm everything is still Paused; delete leftover test campaigns if the account is cluttered.
2. In Fourthwall, archive test products you do not want to keep (they are hidden, so not public).
3. Check the credit balance on the Billing page. The account can redeem `judges-2026` only once, so if it runs under 12, add a second promo to `packages/billing/src/promos.ts` (for example `judges-2026-b`), merge it, run the `polar:seed` job, and redeem the new code as in checklist step 3.
4. Confirm both connections still show connected (a Meta token can expire; reconnect as the owner if so).
5. Nothing in wovain needs deleting: old runs are history and do not block a new drop.
