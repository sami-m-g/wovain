# Creative fatigue on apparel

Builds on `ads-creative`: fatigue comes from time series, never from age alone, and concepts are counted by hook and angle, not by resize.

### POD-C1 Fatigue

Judge fatigue from each ad's own daily series: CTR over the last three settled days below 70% of the ad's first-week CTR, frequency up 30% or more, and hook rate (3-second plays over impressions) down, with at least one breakeven of spend in the window. Meta's `creative_fatigue` webhook raises confidence but never fires the rule by itself.

Niche apparel audiences are small, so fatigue may show earlier than on broad products (guidance, unverified). The fix keeps the design and changes the hook, the angle or the scene. The print stays the same.

### POD-C2 Concept count

Two clips of one hook are one concept. The report shows concepts per design, and a design with one concept gets a `refresh_creative` or `ab_test` candidate before any kill.
