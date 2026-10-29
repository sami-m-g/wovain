# Design

## Decisions

- **Demand / supply, not demand x openness.** A running ad is a competitor in Meta's auction whatever its age: every advertiser counts as supply. Only staying power counts as demand: an ad kept running 14 days counts once, and twice at 30 days (the Adligator and Copyfy tiers already used in `demand.ts`). Bestsellers count 1.5 each, and reviews count log10(1 + reviews), so a thousand reviews isn't a thousand sales signals. Listings are the near-identical ones from the competition read.
- **The Wilson lower bound as the confidence.** Demand's share of the market signals, p = d / (d + s), is ranked by its 95% Wilson lower bound with n = d + s. A theme with one bestseller and no competitors (p = 1, n = 1.5) scores 0.28. A theme with three evergreen ads, three bestsellers and three listings scores well above it. Evidence volume, not a guess, decides. Qloo fit (0 to 1) and the gap bonus (1 + 0.1 per gap, at most 3) multiply it.
- **Saturated has three triggers.** 8 or more near-identical listings of 20 (the competition read's threshold), 15 or more advertisers of the 50 ads sampled, or demand under a quarter of supply.
- **Words are checked in code.** The grounding guard runs on every naming call, routed or not, because an LLM checking an LLM can repeat the invented fact. One retry names what was wrong. A run's idea keeps `words.status = "unavailable"` with the reason, and the card says so. A direction is withdrawn (a `withdrawn` stream event) and dropped with `no_title`.
- **Buyers per idea.** Qloo's ranked audiences, places and brands read `signal.interests.tags` alone for a tagged idea. Demographics need entities, so they read the brief's and carry `buyersScope: "brief"`. Answers kept before scopes are read again.
- **No migration.** `TrendIdea` gains `proof`, `spot` and `words`, and `WhoBuys` gains `scope` and `buyersScope`, all in jsonb. `listIdeas` derives `card` on read, so later competition and who-buys reads show at once.
- **The old path stays with the flag off.** `rankOf` and the trend score are unchanged until the flag is removed.
