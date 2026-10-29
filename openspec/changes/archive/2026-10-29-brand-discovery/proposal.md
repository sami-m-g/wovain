# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/113

## Why

The founder, trying print-on-demand as a newcomer, reached the brand step and found it asks for 3 to 5 taste references and a hex palette and suggests nothing. Someone with no niche gets stuck there. They want to be guided through what sells: automatic suggestions from trends, or a short questionnaire. They also found "Look up on Qloo" meaningless, and "voice" and "palette" unexplained. For the Qloo hackathon, Qloo has to decide the suggestions: without it, the step must not work the same.

## What Changes

Behind a new `brand-discovery` flag (on in development and next, off in production), the onboarding brand step gets three ways in:

- **Suggest for me.** Six Qloo audiences an apparel brand can sell to (a new set each round) each become one candidate. For each, Qloo insights give the artists and shows its fans like (trend-biased), Qloo tags give its themes, and Qloo demographics give who buys. Tavily adds momentum (relevant news in the past month) and saturation (near-identical marketplace listings, the first step of the competition read from #108). Code ranks the cards by Qloo affinity x momentum x low saturation and keeps up to 5. Nemotron (the `brand_discovery` agent, default job, Zod-validated, one call per card) writes only the words: the name, the niche, three example voice lines, three palettes and two product ideas on Fourthwall blank kinds.
- **Ask me a few questions.** Five questions about feelings and goals, never design terms: how it should feel to wear it, what you and your buyers love (Qloo autocomplete), who it is for (age, gender, interests that are Qloo audiences), the goal and how involved you want to be. The answers become Qloo inputs, one card per input.
- **I already know my brand.** Today's form, made plain: each field (niche, references, voice, colours) has a one-line description and an info tooltip with an example. References are checked when the field loses focus, with friendly status words; the "Look up on Qloo" button goes. A live "Your buyers" panel shows from Qloo who they are, what else they love and the themes to try. "Suggest the rest from my references" builds one card from the merchant's own references for the fields' suggestion chips.
- **Picking a card** fills the niche, references, voice and colours; each stays editable and shows 2 or 3 alternatives as chips. Voice is chosen from example lines (own words optional), colours from swatch sets shown on the shirt colours (hex only behind Advanced). Voice and colours are optional defaults: each drop will adapt them.
- **Palettes fit the blank.** A palette is 1 to 3 garment colours the Fourthwall tee really comes in (from the catalog, cached a day; a stated stand-in when no shop is connected) and 2 to 5 ink colours. Code moves or drops any ink under 3:1 contrast on a chosen garment and never offers a garment colour the blank doesn't come in.
- **Qloo decides.** A Qloo failure shows a retry; there is no suggestion made without Qloo. Fewer cards when Qloo finds little, never filler. Every step (Qloo, Tavily, the rank, the palette fit, the model calls) is saved in the decision trace.
- **Free in onboarding.** Discovery spends no credits; each merchant starts at most 12 an hour.
- Qloo calls are capped at 4 in flight and retried on 429 and 5xx.

Per-drop tone and palette (each drop adapting the brand defaults) is a follow-up change.

## Capabilities

### New Capabilities

- `brand-discovery`: Qloo-first starter brands in onboarding, the questionnaire, the buyers panel and the palette fit.

## Impact

- `packages/core`: `brand-discovery.ts`, `discovery-options.ts`, `garment-colors.ts`; `qloo.ts` gains `insights` and `tagsFor` and a concurrency cap with retries; `competition.ts` exports `readSaturation`; a `brand_discovery` agent; the `brand-discovery` flag.
- `packages/api`: `onboarding.discover`, `onboarding.buyers`, `onboarding.searchTaste`; `onboarding.status` reports `discovery`.
- `apps/web`: the brand step and `brand-discovery.tsx`; en, es and fr copy.
- No migration.
