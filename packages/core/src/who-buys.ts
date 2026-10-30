import { createError, log as evlog } from "evlog";

import { buyersOf } from "./brand-discovery";
import type { Buyers } from "./brand-discovery";
import type { Logger } from "./log";
import type { Qloo, QlooRanked, WhoSignals } from "./qloo";
import type { DecisionTrace, TraceSource } from "./trace";

// "Who buys this and where" (openspec who-buys): the buyers of one idea,
// from Qloo alone, before any connector. Qloo demographics give the age and
// gender lean, Qloo's ranked audiences (urn:audience) the interests to
// target, Qloo's ranked localities the cities where the fans are, and Qloo's fashion
// brands what they already wear. Expert practice: define the buyer by age,
// gender, location and lifestyle before designing (Printify's audience
// guide), and aim ads at where the fans live rather than broad.
//
// Without Qloo there is no answer: any Qloo failure throws, logged at
// error level, never filled in with a guess. Every value is recorded in the
// decision trace with its Qloo source.

export const TOP_AUDIENCES = 5;
export const TOP_PLACES = 5;
export const TOP_BRANDS = 3;
// Where the buyers are looked for when no country is asked for: the US,
// where 72.5% of the Shopify stores on Printful's print-on-demand app sell
// (StoreLeads, November 2024). Qloo needs a location for places.
export const DEFAULT_LOCATION = "United States";

export interface WhoBuysPlace {
  affinity: number;
  // The country, from Qloo's disambiguation.
  country?: string | undefined;
  id: string;
  name: string;
  // The region and country, as Qloo names them.
  where?: string | undefined;
}

export interface WhoBuysAudience {
  affinity: number;
  // The audience family ("Hobbies And Interests").
  family?: string | undefined;
  id: string;
  name: string;
}

// Whose buyers these are: the idea's own Qloo signals (its tag, or the
// entities rising for it), or the brief's, shared by every idea of a run.
export type WhoBuysScope = "brief" | "idea";

export interface WhoBuys {
  // Qloo's fashion brands the fans like: data for targeting, never for the
  // design.
  brands: { affinity: number; id: string; name: string }[];
  // Age and gender lean, from the idea's Qloo entities (none for a tag-only
  // idea).
  buyers: Buyers;
  audiences: WhoBuysAudience[];
  // The country the places were looked for in.
  location: string;
  places: WhoBuysPlace[];
  // Whose signals the audiences, places and brands came from. Answers
  // kept before scopes have none: they were read from the brief.
  scope?: WhoBuysScope | undefined;
  // Whose entities the age and gender came from.
  buyersScope?: WhoBuysScope | undefined;
}

export interface WhoBuysOptions {
  // Entities for the age and gender when the signals have none (a tag-only
  // idea): the brief's, so the card says they are the brief's.
  demographics?: readonly string[] | undefined;
  // Whose signals `signals` are.
  scope?: WhoBuysScope | undefined;
}

export interface WhoBuysDeps {
  log?: Logger | undefined;
  qloo: Pick<
    Qloo,
    "audiencesOf" | "demographicsOf" | "fashionBrandsOf" | "placesOf"
  >;
  trace?: DecisionTrace | undefined;
}

export const whoBuysQlooFailed = () =>
  createError({
    code: "WHO_BUYS_QLOO_FAILED",
    fix: "Try again in a moment.",
    message: "We couldn't reach our taste data to say who buys this",
    status: 502,
    why: "A Qloo request for the buyers failed; wovain never guesses them without Qloo.",
  });

export const whoBuysNoSignal = () =>
  createError({
    code: "WHO_BUYS_NO_SIGNAL",
    fix: "Research the idea again; ideas saved before Qloo was required have no Qloo data.",
    message: "This idea has no Qloo data to read its buyers from",
    status: 422,
  });

const FAMILY = /\((?<family>[^()]+)\)\s*$/u;

// "Tattoos (Hobbies And Interests)" is in the Hobbies And Interests family.
export const familyOf = (disambiguation?: string) =>
  disambiguation === undefined
    ? undefined
    : FAMILY.exec(disambiguation)?.groups?.["family"];

// The country is the last part of Qloo's place name, without its notes:
// "Torcy, Seine-et-Marne, Île-de-France, France métropolitaine, France
// (terres)" is in France.
export const countryOf = (where?: string) => {
  const last = where?.split(",").at(-1)?.trim();
  return last === undefined || last === ""
    ? undefined
    : last.replace(/\s*\([^)]*\)\s*$/u, "");
};

// Audience families no apparel ad should target: Meta removed detailed
// targeting on sensitive topics (health, religion, politics, sexual
// orientation) in January 2022, and wovain's audience list
// (./qloo-audiences) leaves the same families out.
const SENSITIVE_FAMILIES = new Set([
  "beliefs",
  "communities",
  "global issues",
  "investing",
  "political",
  "politics",
  "professions",
]);

// Audiences whose names say they are about money, jobs or politics, which
// Qloo files under other families ("Angel Start Up Investing", "Sales
// Professional", "Political Junkie"): no taste to sell a shirt to.
const OFF_TOPIC =
  /\b(?:invest\w*|start[ -]?ups?|politic\w*|professionals?|executives?|entrepreneurs?|finance|financial|real estate)\b/iu;

// The audiences an ad can be aimed at, best first.
export const targetable = (audiences: readonly QlooRanked[]) =>
  audiences
    .filter(
      (one) =>
        !SENSITIVE_FAMILIES.has((familyOf(one.where) ?? "").toLowerCase()) &&
        !OFF_TOPIC.test(one.name)
    )
    .slice(0, TOP_AUDIENCES);

// Places worth a campaign: Qloo's affinity weighed by the place's
// popularity, so a city with many fans outranks a village where a few
// love it.
export const markets = (places: readonly QlooRanked[]) =>
  places
    .toSorted(
      (first, second) =>
        second.affinity * (second.popularity ?? 1) -
        first.affinity * (first.popularity ?? 1)
    )
    .slice(0, TOP_PLACES);

const sourcesOf = (rows: readonly QlooRanked[]): TraceSource[] =>
  rows.map((row) => ({ id: row.id, provider: "qloo", title: row.name }));

const failed = (step: string, error: unknown) => {
  evlog.error({
    error: {
      code: "WHO_BUYS_STEP_FAILED",
      message: `Who buys ${step} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      name: "WhoBuysStepFailed",
      ...(error instanceof Error &&
        error.stack !== undefined && { stack: error.stack }),
    },
    whoBuys: { step },
  });
};

// One Qloo step; a failure is logged and becomes WHO_BUYS_QLOO_FAILED.
const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    failed(name, error);
    throw whoBuysQlooFailed();
  }
};

// Who buys the idea and where, from its Qloo entities and tags.
export const whoBuys = async (
  deps: WhoBuysDeps,
  signals: WhoSignals,
  location: string = DEFAULT_LOCATION,
  options: WhoBuysOptions = {}
): Promise<WhoBuys> => {
  const own = signals.entities ?? [];
  if (own.length === 0 && (signals.tags ?? []).length === 0) {
    throw whoBuysNoSignal();
  }
  const scope = options.scope ?? "idea";
  const entities = own.length > 0 ? own : (options.demographics ?? []);
  const buyersScope: WhoBuysScope = own.length > 0 ? scope : "brief";
  const [demographics, audiences, places, brands] = await Promise.all([
    step("qloo.demographics", async () =>
      entities.length === 0
        ? []
        : await deps.qloo.demographicsOf(entities, deps.log)
    ),
    step(
      "qloo.audiences",
      async () =>
        await deps.qloo.audiencesOf(signals, deps.log, TOP_AUDIENCES * 2)
    ),
    step(
      "qloo.places",
      async () =>
        await deps.qloo.placesOf(signals, location, deps.log, TOP_PLACES * 3)
    ),
    step(
      "qloo.brands",
      async () => await deps.qloo.fashionBrandsOf(signals, deps.log, TOP_BRANDS)
    ),
  ]);
  const result: WhoBuys = {
    audiences: targetable(audiences).map((one) => ({
      affinity: one.affinity,
      family: familyOf(one.where),
      id: one.id,
      name: one.name,
    })),
    brands: brands.slice(0, TOP_BRANDS).map((one) => ({
      affinity: one.affinity,
      id: one.id,
      name: one.name,
    })),
    buyers: buyersOf(demographics, entities),
    buyersScope,
    location,
    places: markets(places).map((one) => ({
      affinity: one.affinity,
      country: countryOf(one.where),
      id: one.id,
      name: one.name,
      where: one.where,
    })),
    scope,
  };
  deps.trace?.add({
    agent: "who_buys",
    inputSummary: `${entities.length} entit(ies), ${(signals.tags ?? []).length} tag(s); location: ${location}`,
    output: {
      age: result.buyers.age,
      audiences: result.audiences.map((one) => one.name),
      brands: result.brands.map((one) => one.name),
      gender: result.buyers.gender,
      places: result.places.map((one) => one.name),
    },
    sources: [
      ...sourcesOf(audiences),
      ...sourcesOf(places),
      ...sourcesOf(brands),
      ...entities.map((id) => ({
        id,
        provider: "qloo" as const,
        title: "demographics",
      })),
    ],
    step: "who.buys",
  });
  return result;
};
