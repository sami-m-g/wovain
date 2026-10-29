import type { Competition } from "./competition";
import type { AdDemand, MarketDemand } from "./demand";
import type { Citation } from "./evidence";
import type { IdeaWordsResult } from "./idea-words";
import type { OutcomeWhy } from "./outcomes";
import { SATURATED_LISTINGS } from "./sweet-spot";
import type { SweetSpot } from "./sweet-spot";
import type { TrendIdea } from "./trends";
import type { WhoBuys, WhoBuysScope } from "./who-buys";

// One data contract for every idea the merchant sees (openspec
// idea-evidence), whichever pipeline found it: "what to sell now"
// (./drop-directions) or trend research (./trends). The fixed idea card
// (founder/story-ui-proposal.md, section 5) has four sections in one
// order: what to make, why it sells, who buys and where, competition. Each
// is either read (`ok`) or `unavailable` with the reason, so a section
// never vanishes without saying why.

export const UNAVAILABLE_REASONS = [
  // Not read yet: read on demand (who buys) or by an older pipeline.
  "not_read",
  // The read failed; the failure was logged at error level.
  "read_failed",
  // The source needs a connection the merchant hasn't made (Meta).
  "not_connected",
  // Read, and nothing was found.
  "none_found",
  // The title and concept stated what the evidence doesn't hold, twice.
  "ungrounded",
  // The title was only the raw Qloo tag, twice.
  "raw_tag",
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export type Field<T> =
  | { status: "ok"; value: T }
  | { reason: UnavailableReason; status: "unavailable" };

// What to make: a merchant-readable concept, written from the evidence.
export interface IdeaMake {
  // What a run researches when the merchant picks it.
  brief: string;
  // One line: the design, the buyer and the product.
  concept: string;
  // Who wears it: "for night owls who read in cafés".
  buyer?: string | undefined;
  // Why they buy it: "identity tee".
  occasion?: string | undefined;
  // The products the demand was proven for.
  products: string[];
  // The design's look, when written.
  style?: string | undefined;
  // "Moth and moon line-art crest", never a raw Qloo tag.
  title: string;
}

// Qloo's evidence: the tag the idea is and what it rose with.
export interface IdeaQloo {
  // Qloo's affinity of the theme with its audience, 0 to 1.
  affinity: number;
  // The Qloo audience it grew from, when one.
  audience?: string | undefined;
  // The Qloo entities behind it (never printed).
  entities: { id: string; name: string }[];
}

// Proof that it sells.
export interface IdeaDemand {
  // The Meta Ad Library read: shops advertising apparel on the theme.
  ads: Field<AdDemand>;
  // Etsy, Amazon and Redbubble: bestsellers and reviews.
  market: Field<MarketDemand>;
  // A shop kept an ad two weeks, a bestseller, or 50 reviews.
  proven: boolean;
}

export interface IdeaWhy {
  // Qloo's affinity, 0 to 1.
  affinity: number;
  citations: Citation[];
  demand: Field<IdeaDemand>;
  qloo: IdeaQloo;
  // The Qloo tag, shown as evidence beside the readable title.
  qlooTag: { id?: string | undefined; name: string };
  // One line from the evidence only ("why now").
  sentence: string;
  // News about the theme in the past month.
  trend?: { news: number } | undefined;
}

export interface IdeaAudience {
  ages: string[];
  // The Qloo signals the ages and gender came from: the brief's entities
  // when the idea has only a tag.
  agesScope: WhoBuysScope;
  // Fashion brands the fans like: targeting data, never on a design.
  alsoLikes: string[];
  gender?: string | undefined;
  // Audiences an ad can aim at.
  interests: string[];
  places: { affinity: number; country?: string | undefined; name: string }[];
  // "brief": the same buyers as the brief, said once, not on every card.
  scope: WhoBuysScope;
}

// open: no near-identical listing or advertiser; sweet-spot: proven demand
// with room; crowded: saturated.
export type CompetitionLevel = "crowded" | "open" | "sweet-spot";

export interface IdeaCompetition {
  // Shops advertising the theme now, when the Ad Library was read.
  advertisers?: number | undefined;
  citations: Citation[];
  // Audience cues no listing covers.
  gaps: string[];
  level: CompetitionLevel;
  // Near-identical marketplace listings.
  listings: number;
  // The median price competitors charge, when read.
  medianPrice?: number | undefined;
  // How many marketplace results the count is out of.
  sampled?: number | undefined;
}

export interface IdeaCard {
  audience: Field<IdeaAudience>;
  competition: Field<IdeaCompetition>;
  make: Field<IdeaMake>;
  // The pipeline that found it.
  origin: "directions" | "trends";
  // Why the merchant's own record favours or warns against it (feedback-loop
  // on, and a confident angle shared). Absent with no track record.
  outcome?: OutcomeWhy | undefined;
  // Its place in the honest rank, when the evidence gate ranked it.
  spot?: SweetSpot | undefined;
  why: Field<IdeaWhy>;
}

export const ok = <T>(value: T): Field<T> => ({ status: "ok", value });
export const unavailable = <T>(reason: UnavailableReason): Field<T> => ({
  reason,
  status: "unavailable",
});

// Every demand read is for shirts (demand.ts searches "<theme> shirt").
export const PROVEN_PRODUCTS = ["t-shirt"];

// What a demand read gives, whichever pipeline: undefined ads with the Ad
// Library connected is a failed read; without it, not connected.
export const demandField = (
  ads: AdDemand | undefined,
  market: MarketDemand | undefined,
  adLibrary: "connected" | "not_connected",
  proven: boolean
): Field<IdeaDemand> => {
  if (ads === undefined && market === undefined) {
    return unavailable("read_failed");
  }
  return ok({
    ads:
      ads === undefined
        ? unavailable(
            adLibrary === "connected" ? "read_failed" : "not_connected"
          )
        : ok(ads),
    market: market === undefined ? unavailable("read_failed") : ok(market),
    proven,
  });
};

export const competitionLevelOf = (
  listings: number,
  advertisers: number,
  saturated: boolean
): CompetitionLevel => {
  if (saturated || listings >= SATURATED_LISTINGS) {
    return "crowded";
  }
  return listings === 0 && advertisers === 0 ? "open" : "sweet-spot";
};

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "under 25",
  "25_to_29": "25-29",
  "30_to_34": "30-34",
  "35_to_44": "35-44",
  "45_to_54": "45-54",
  "55_and_older": "55+",
};

export const audienceField = (
  whoBuys: WhoBuys | null | undefined
): Field<IdeaAudience> => {
  if (whoBuys === null || whoBuys === undefined) {
    return unavailable("not_read");
  }
  const ages = [whoBuys.buyers.age, whoBuys.buyers.nextAge].flatMap((age) =>
    age === undefined ? [] : [AGE_LABEL[age] ?? age]
  );
  if (
    ages.length === 0 &&
    whoBuys.places.length === 0 &&
    whoBuys.audiences.length === 0
  ) {
    return unavailable("none_found");
  }
  const scope = whoBuys.scope ?? "brief";
  return ok({
    ages,
    agesScope: whoBuys.buyersScope ?? scope,
    alsoLikes: whoBuys.brands.map((brand) => brand.name),
    gender: whoBuys.buyers.gender,
    interests: whoBuys.audiences.map((one) => one.name),
    places: whoBuys.places.map((place) => ({
      affinity: place.affinity,
      country: place.country,
      name: place.name,
    })),
    scope,
  });
};

const competitionFromRead = (
  competition: Competition
): Field<IdeaCompetition> => {
  if (competition.status !== "read" || competition.saturation === undefined) {
    return unavailable("read_failed");
  }
  return ok({
    citations: competition.saturation.listings,
    gaps: competition.gaps.map((gap) => gap.cue),
    level: competitionLevelOf(
      competition.saturation.count,
      0,
      competition.saturated
    ),
    listings: competition.saturation.count,
    medianPrice: competition.prices?.median,
    sampled: competition.saturation.sampled,
  });
};

interface CardReads {
  competition?: Competition | null | undefined;
  whoBuys?: WhoBuys | null | undefined;
}

// The competition read kept on the row wins; else the gate's own read.
const trendCompetition = (
  research: TrendIdea,
  read: Competition | null | undefined
): Field<IdeaCompetition> => {
  if (read !== null && read !== undefined) {
    return competitionFromRead(read);
  }
  const supply = research.proof?.supply;
  if (supply === undefined) {
    return unavailable("not_read");
  }
  if (supply === null) {
    return unavailable("read_failed");
  }
  return ok({
    citations: supply.citations,
    gaps: research.proof?.gaps ?? [],
    level: competitionLevelOf(supply.count, 0, false),
    listings: supply.count,
    medianPrice: research.prices?.median,
    sampled: supply.sampled,
  });
};

const trendWhy = (research: TrendIdea): Field<IdeaWhy> => {
  const { affinity } = research.signals;
  if (affinity <= 0) {
    return unavailable("none_found");
  }
  const { proof } = research;
  return ok({
    affinity,
    citations: research.sources.map(({ title, url }) => ({ title, url })),
    demand:
      proof === undefined
        ? unavailable("not_read")
        : demandField(undefined, proof.market, "not_connected", proof.proven),
    qloo: {
      affinity,
      entities: (research.taste?.seeds ?? [])
        .slice(0, 3)
        .map((seed) => ({ id: seed.id, name: seed.name })),
    },
    qlooTag: {
      id: research.taste?.tag?.id ?? research.qlooTag,
      name: research.theme,
    },
    sentence:
      (research.words?.status === "ok" ? research.words.whyNow : undefined) ??
      research.moment ??
      "",
    trend: { news: research.signals.newsHits },
  });
};

// What to make, from the checked words; never the raw tag.
export const makeOf = (words: IdeaWordsResult | undefined): Field<IdeaMake> => {
  if (words === undefined) {
    return unavailable("not_read");
  }
  if (words.status === "unavailable") {
    return unavailable(
      words.reason === "failed" ? "read_failed" : words.reason
    );
  }
  return ok({
    brief: words.concept,
    buyer: words.buyer,
    concept: words.concept,
    occasion: words.occasion,
    products: PROVEN_PRODUCTS,
    style: words.style,
    title: words.title,
  });
};

// A saved trend idea as a card: the research, plus the competition and
// who-buys reads kept on the idea row once made.
export const trendCardOf = (
  research: TrendIdea,
  reads: CardReads = {}
): IdeaCard => ({
  audience: audienceField(reads.whoBuys),
  competition: trendCompetition(research, reads.competition),
  make: makeOf(research.words),
  origin: "trends",
  outcome: research.outcome,
  spot: research.spot,
  why: trendWhy(research),
});
