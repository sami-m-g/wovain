import type {
  TavilyClient,
  TavilyGetResearchResponse,
  TavilySearchResponse,
} from "@tavily/core";
import { z } from "zod";

import { external } from "./log";
import type { Logger } from "./log";
import { median } from "./score";

// Tavily as the evidence layer: every claim wovain shows the merchant (why a
// theme is timely, what competitors charge, whether a slogan is someone
// else's mark) carries the pages it came from. Everything Tavily returns is
// untrusted web text, kept as data only. Code decides; no model does.

export type TavilyWeb = Pick<
  TavilyClient,
  "extract" | "getResearch" | "research" | "search"
>;

export interface Citation {
  title: string;
  url: string;
}

const TITLE_MAX = 300;
const TEXT_MAX = 1200;
const LIST_MAX = 6;

export const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const SENTENCE_END = /(?<=[.!?])\s+/u;

/**
 * Whole sentences up to `max` characters, never a cut word: a first sentence
 * longer than `max` stays whole (the page wraps it).
 */
export const sentencesWithin = (text: string, max: number) => {
  const [first = "", ...rest] = text.trim().split(SENTENCE_END);
  let line = first;
  for (const next of rest) {
    if (`${line} ${next}`.length > max) {
      break;
    }
    line = `${line} ${next}`;
  }
  return line;
};

export const isWebUrl = (value: string) =>
  URL.canParse(value) && /^https?:$/u.test(new URL(value).protocol);

export const hostOf = (url: string) =>
  new URL(url).hostname.replace(/^www\./u, "").toLowerCase();

export const onDomain = (url: string, domains: readonly string[]) => {
  const host = hostOf(url);
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
};

export const keyOf = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

// Social posts: a caption with a call to action and a link, not a page
// about the theme ("Dark As Night Shirt Shop the look → link in bio …").
export const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "threads.net",
  "tiktok.com",
  "twitter.com",
  "x.com",
];

// Separators page titles put between a name and the site's boilerplate:
// marks that break a title wherever they stand ("Tee|Etsy"), and dashes
// that break it only between spaces ("Spider-Man" is one name).
const TITLE_MARKS = ["|", "→", "»", "•", "·"];
const TITLE_DASHES = new Set(["–", "—", "-"]);
// Calls to action web titles end with.
const CALLS_TO_ACTION = [
  "buy now",
  "click here",
  "learn more",
  "link in bio",
  "order now",
  "read more",
  "shop now",
  "shop the look",
];
// Punctuation a link may stand in: "(https://…)".
const LINK_WRAP = /^[([{<"'“]+|[)\]}>"'”.,;:!?]+$/gu;

const isLinkWord = (word: string) => {
  const bare = word.replaceAll(LINK_WRAP, "").toLowerCase();
  return (
    bare.startsWith("www.") ||
    bare.startsWith("http:") ||
    bare.startsWith("https:")
  );
};

// The title before its first separator mark.
const firstPart = (title: string) => {
  let text = title;
  for (const mark of TITLE_MARKS) {
    text = text.split(mark)[0] ?? text;
  }
  return text;
};

// A source's title as the merchant reads it: its first part, without links
// or a trailing call to action; the page's host when nothing is left.
export const sourceTitle = (title: string | null | undefined, url: string) => {
  const words: string[] = [];
  for (const word of firstPart(title ?? "").split(/\s+/u)) {
    if (TITLE_DASHES.has(word) && words.length > 0) {
      break;
    }
    if (word !== "" && !isLinkWord(word) && !TITLE_DASHES.has(word)) {
      words.push(word);
    }
  }
  let text = words.join(" ");
  let trimmed = true;
  while (trimmed) {
    const lower = text.toLowerCase();
    const call = CALLS_TO_ACTION.find(
      (one) => lower === one || lower.endsWith(` ${one}`)
    );
    trimmed = call !== undefined;
    if (call !== undefined) {
      text = text.slice(0, text.length - call.length).trim();
    }
  }
  return clip(text === "" ? hostOf(url) : text, TITLE_MAX);
};

export const citationsOf = (
  items: { title?: string | null | undefined; url: string }[]
) => {
  const seen = new Set<string>();
  return items.flatMap(({ title, url }) => {
    if (!isWebUrl(url) || seen.has(url)) {
      return [];
    }
    seen.add(url);
    return [{ title: sourceTitle(title, url), url }];
  });
};

// ---------------------------------------------------------------------------
// Trademark guardrail: every word a design prints is searched as an exact
// phrase on trademark registers and the big print-on-demand marketplaces.

// Registers whose page titles name the mark ("SPOOKY SEASON Trademark …").
export const TRADEMARK_DOMAINS = [
  "uspto.gov",
  "trademarkia.com",
  "trademarks.justia.com",
  "euipo.europa.eu",
] as const;
// Marketplaces where the same words already sell: a caution, not a block.
export const MARKETPLACE_DOMAINS = [
  "redbubble.com",
  "teepublic.com",
  "etsy.com",
  "amazon.com",
] as const;
// Single short words ("BOO") are too common to own; they aren't searched.
const MIN_PHRASE_CHARS = 5;
const TIMEOUT_S = 20;

export type PhraseVerdict = "blocked" | "caution" | "clear" | "unchecked";

export interface PhraseCheck {
  phrase: string;
  verdict: PhraseVerdict;
  // The trademark or listing pages that matched, or why it wasn't checked.
  citations: Citation[];
  error?: string | undefined;
}

export interface TrademarkCheck {
  checks: PhraseCheck[];
  // True when no phrase is blocked or unchecked.
  pass: boolean;
}

const searchable = (phrase: string) =>
  phrase.trim().split(/\s+/u).length > 1 ||
  phrase.trim().length >= MIN_PHRASE_CHARS;

// A register's page counts only when its title carries the whole phrase;
// a listing counts when its title or snippet does.
export const verdictOf = (
  phrase: string,
  results: TavilySearchResponse["results"]
): Omit<PhraseCheck, "phrase"> => {
  const wanted = keyOf(phrase);
  const web = results.filter((hit) => isWebUrl(hit.url));
  const marks = web.filter(
    (hit) =>
      onDomain(hit.url, TRADEMARK_DOMAINS) && keyOf(hit.title).includes(wanted)
  );
  if (marks.length > 0) {
    return { citations: citationsOf(marks).slice(0, 3), verdict: "blocked" };
  }
  const listings = web.filter(
    (hit) =>
      onDomain(hit.url, MARKETPLACE_DOMAINS) &&
      keyOf(`${hit.title} ${hit.content}`).includes(wanted)
  );
  if (listings.length > 0) {
    return { citations: citationsOf(listings).slice(0, 3), verdict: "caution" };
  }
  return { citations: [], verdict: "clear" };
};

const checkPhrase = async (
  client: Pick<TavilyWeb, "search">,
  phrase: string,
  log?: Logger
): Promise<PhraseCheck> => {
  if (!searchable(phrase)) {
    return { citations: [], phrase, verdict: "clear" };
  }
  try {
    const reply = await external(
      log,
      { operation: "trademark_search", provider: "tavily" },
      async () =>
        await client.search(`"${phrase.replaceAll('"', "")}" trademark`, {
          exactMatch: true,
          includeDomains: [...TRADEMARK_DOMAINS, ...MARKETPLACE_DOMAINS],
          maxResults: 10,
          searchDepth: "basic",
          timeout: TIMEOUT_S,
        })
    );
    return { phrase, ...verdictOf(phrase, reply.results) };
  } catch (error) {
    // The guardrail fails closed: an unchecked phrase holds the design for
    // the merchant, and the failure reaches error tracking.
    const failure = asError(error);
    log?.error?.(failure);
    return {
      citations: [],
      error: clip(failure.message, TITLE_MAX),
      phrase,
      verdict: "unchecked",
    };
  }
};

export const checkTrademarks = async (
  client: Pick<TavilyWeb, "search">,
  phrases: string[],
  log?: Logger
): Promise<TrademarkCheck> => {
  // One search per phrase, case and punctuation aside; the first spelling
  // stands.
  const seen = new Set<string>([""]);
  const unique = phrases.flatMap((phrase) => {
    const key = keyOf(phrase);
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [phrase.trim()];
  });
  const checks = await Promise.all(
    unique.map(async (phrase) => await checkPhrase(client, phrase, log))
  );
  return {
    checks,
    pass: checks.every(
      (check) => check.verdict === "clear" || check.verdict === "caution"
    ),
  };
};

// One line for the design check, naming what failed and where.
export const trademarkNote = ({ checks }: TrademarkCheck) => {
  const blocked = checks.filter((check) => check.verdict === "blocked");
  const unchecked = checks.filter((check) => check.verdict === "unchecked");
  if (blocked.length === 0 && unchecked.length === 0) {
    return checks.length === 0
      ? "No printed words to check."
      : "No registered mark found for the printed words.";
  }
  const parts = [
    ...blocked.map(
      (check) =>
        `"${check.phrase}" matches a trademark record (${check.citations
          .map((citation) => hostOf(citation.url))
          .join(", ")}): change the printed words.`
    ),
    ...unchecked.map(
      (check) =>
        `"${check.phrase}" couldn't be checked for trademarks; check it before selling.`
    ),
  ];
  return parts.join(" ");
};

// ---------------------------------------------------------------------------
// Competitor prices: Tavily Extract reads the listing pages a marketplace
// search found, and code reads the prices off them.

export const COMPETITOR_DOMAINS = [
  "redbubble.com",
  "teepublic.com",
  "etsy.com",
] as const;
const EXTRACT_MAX = 5;
const PRICES = /(?:US)?\$\s?(?<amount>\d{1,3}(?:\.\d{2})?)/gu;
// A tee or hoodie sells between these; anything else is shipping, a bundle
// or a coupon.
const MIN_PRICE = 8;
const MAX_PRICE = 120;

export interface CompetitorPrices {
  // Median listing price in USD, when any page showed one.
  median?: number | undefined;
  // One price per page that showed one.
  prices: number[];
  citations: Citation[];
  // Pages Tavily couldn't read, with its reason.
  failed: { url: string; error: string }[];
}

// The page's own price: the first plausible one. Extract returns the
// chunks most relevant to "price of this t-shirt" first, so shipping lines
// and "related items" come later.
export const priceOnPage = (text: string): number | undefined => {
  for (const match of text.matchAll(PRICES)) {
    const amount = Number(match.groups?.["amount"]);
    if (amount >= MIN_PRICE && amount <= MAX_PRICE) {
      return amount;
    }
  }
  return undefined;
};

export const competitorPrices = async (
  client: Pick<TavilyWeb, "extract">,
  urls: string[],
  log?: Logger
): Promise<CompetitorPrices> => {
  const listings = [...new Set(urls)]
    .filter((url) => isWebUrl(url) && onDomain(url, COMPETITOR_DOMAINS))
    .slice(0, EXTRACT_MAX);
  if (listings.length === 0) {
    return { citations: [], failed: [], prices: [] };
  }
  const reply = await external(
    log,
    { operation: "extract_prices", provider: "tavily" },
    async () =>
      await client.extract(listings, {
        chunksPerSource: 3,
        extractDepth: "basic",
        format: "text",
        query: "price of this t-shirt in US dollars",
        timeout: TIMEOUT_S,
      })
  );
  const priced = reply.results.flatMap((page) => {
    const price = priceOnPage(page.rawContent);
    return price === undefined ? [] : [{ ...page, price }];
  });
  const failed = reply.failedResults.map(({ error, url }) => ({
    error: clip(error, TITLE_MAX),
    url,
  }));
  // Pages Tavily couldn't read are data, not errors: the margin falls back
  // to the search snippets. The wide event still lists them.
  log?.set({
    evidence: {
      extractFailed: failed.length,
      extracted: reply.results.length,
      priced: priced.length,
    },
  });
  const prices = priced.map((page) => page.price);
  return {
    citations: citationsOf(
      priced.map((page) => ({ title: page.title, url: page.url }))
    ),
    failed,
    median: median(prices),
    prices,
  };
};

// ---------------------------------------------------------------------------
// The research dossier: Tavily Research answers "should we drop this theme?"
// in a fixed shape, reasoning over the idea's Qloo taste data (attached as a
// JSON file) as well as the web. It runs in the background on Tavily's side:
// start it, then read it back until it's done.

export const DOSSIER_SCHEMA = {
  properties: {
    citations: {
      description:
        "Every web page the answer relies on, with its title and full URL.",
      items: {
        properties: {
          title: { description: "The page title.", type: "string" },
          url: { description: "The full URL of the page.", type: "string" },
        },
        required: ["title", "url"],
        type: "object",
      },
      type: "array",
    },
    price_band: {
      description:
        "What comparable print-on-demand t-shirts on this theme sell for in US dollars on Redbubble, TeePublic and Etsy.",
      properties: {
        high_usd: {
          description: "The typical highest price, in US dollars.",
          type: "number",
        },
        low_usd: {
          description: "The typical lowest price, in US dollars.",
          type: "number",
        },
        note: {
          description: "One sentence on where most listings sit.",
          type: "string",
        },
      },
      required: ["low_usd", "high_usd", "note"],
      type: "object",
    },
    risks: {
      description:
        "Up to 5 risks of selling merch on this theme: trademarks or licensed characters, a fading trend, platform policy, saturation. One sentence each.",
      items: { type: "string" },
      type: "array",
    },
    saturation: {
      description:
        "How crowded the theme already is on print-on-demand marketplaces: low, medium or high, then one sentence why.",
      type: "string",
    },
    // The report at a glance: what the drop page shows before the full text.
    summary: {
      description:
        "The same answers at a glance, one complete sentence each of at most 140 characters, for a designer scanning the report.",
      properties: {
        price: {
          description:
            "Where most comparable shirts are priced, one complete sentence of at most 140 characters, e.g. 'Most sell for $24 to $28 on Etsy'.",
          maxLength: 140,
          type: "string",
        },
        risks: {
          description:
            "Up to 3 risks, each one complete sentence of at most 140 characters, e.g. 'Movie title is trademarked'.",
          items: { maxLength: 140, type: "string" },
          type: "array",
        },
        saturation: {
          description:
            "Why it is that crowded, one complete sentence of at most 140 characters, e.g. 'Hundreds of generic fern tees, few in this style'.",
          maxLength: 140,
          type: "string",
        },
        saturation_level: {
          description:
            "How crowded the theme is on print-on-demand marketplaces: exactly low, medium or high.",
          type: "string",
        },
        why_now: {
          description:
            "Why buyers want it this month, one complete sentence of at most 140 characters, e.g. 'Season 2 premieres next week'.",
          maxLength: 140,
          type: "string",
        },
      },
      required: ["why_now", "saturation_level", "saturation", "price", "risks"],
      type: "object",
    },
    why_now: {
      description:
        "Two or three sentences on why this theme matters to buyers this month, citing recent events.",
      type: "string",
    },
  },
  required: [
    "why_now",
    "saturation",
    "price_band",
    "risks",
    "summary",
    "citations",
  ],
} as const;

const SATURATION_LEVELS = ["low", "medium", "high"] as const;
export type SaturationLevel = (typeof SATURATION_LEVELS)[number];
// A one-line answer: one short sentence, kept whole when over-long.
export const LINE_MAX = 140;
const SUMMARY_RISKS_MAX = 3;

const saturationLevelOf = (
  level: string | undefined
): SaturationLevel | undefined =>
  SATURATION_LEVELS.find((one) => one === level?.trim().toLowerCase());

// The report at a glance. Dossiers saved before it existed have none.
const summarySchema = z.object({
  price: z.string().default(""),
  risks: z.array(z.string()).default([]),
  saturation: z.string().default(""),
  saturation_level: z.string().optional(),
  why_now: z.string().default(""),
});

// Tavily fills the schema; anything it leaves out reads as empty.
const dossierSchema = z.object({
  citations: z
    .array(z.object({ title: z.string().optional(), url: z.string() }))
    .default([]),
  price_band: z
    .object({
      // Tavily may answer null where it found no price.
      high_usd: z.number().nonnegative().nullish(),
      low_usd: z.number().nonnegative().nullish(),
      note: z.string().default(""),
    })
    .default({ note: "" }),
  risks: z.array(z.string()).default([]),
  saturation: z.string().default(""),
  // Read on its own below: a summary Tavily got wrong never fails the report.
  summary: z.unknown().optional(),
  why_now: z.string().min(1),
});

/** The report at a glance: one short line per answer. */
export interface DossierSummary {
  whyNow: string;
  saturationLevel?: SaturationLevel | undefined;
  saturation: string;
  price: string;
  risks: string[];
}

export interface Dossier {
  whyNow: string;
  saturation: string;
  priceBand: {
    lowUsd?: number | undefined;
    highUsd?: number | undefined;
    note: string;
  };
  risks: string[];
  citations: Citation[];
  summary?: DossierSummary | undefined;
}

// Tavily Research's model (TAVILY_RESEARCH_MODEL, set per environment from
// Pulumi config): mini is cheaper and quicker, pro digs deeper, auto lets
// Tavily choose.
export const RESEARCH_MODELS = ["mini", "pro", "auto"] as const;
export type ResearchModel = (typeof RESEARCH_MODELS)[number];

export interface DossierInput {
  model: ResearchModel;
  seed: string;
  theme: string;
  // What Qloo knows about the merchant's audience and this theme; sent to
  // Tavily as a JSON file, never pasted into the prompt.
  taste: Record<string, unknown>;
}

export const dossierPrompt = ({ seed, theme }: DossierInput) =>
  clip(
    `We are an independent apparel designer deciding whether to release a print-on-demand t-shirt drop on the theme "${theme}" for fans of "${seed}". The attached qloo-taste.json holds Qloo's taste data for this audience: use it to judge fit. Research why this theme matters to these buyers right now, how crowded it already is on Redbubble, TeePublic and Etsy, what comparable shirts sell for, and the risks (trademarks, licensed characters, fading interest). Cite every claim.`,
    TEXT_MAX
  );

export const startDossier = async (
  client: Pick<TavilyWeb, "research">,
  input: DossierInput,
  log?: Logger
): Promise<{ requestId: string }> => {
  const file = Buffer.from(JSON.stringify(input.taste)).toString("base64");
  const reply = await external(
    log,
    { operation: "research_start", provider: "tavily" },
    async () =>
      await client.research(dossierPrompt(input), {
        citationFormat: "numbered",
        // Passed through to the API as is (docs.tavily.com research `files`).
        files: [{ data: file, name: "qloo-taste.json", type: "base64" }],
        model: input.model,
        outputSchema: DOSSIER_SCHEMA,
      })
  );
  if (!("requestId" in reply) || typeof reply.requestId !== "string") {
    throw new Error("Tavily research returned no request ID");
  }
  return { requestId: reply.requestId };
};

export type DossierState =
  | { status: "pending" }
  | { status: "failed"; error: string }
  | { status: "done"; dossier: Dossier };

const parseContent = (content: unknown): unknown => {
  if (typeof content !== "string") {
    return content;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    // A report instead of JSON: it fails the schema below, loudly.
    return { content };
  }
};

export const dossierOf = (
  content: unknown,
  sources: { title: string; url: string }[]
): Dossier => {
  const parsed = dossierSchema.parse(parseContent(content));
  const glance = summarySchema.safeParse(parsed.summary);
  const summary = glance.success ? glance.data : undefined;
  return {
    citations: citationsOf([...parsed.citations, ...sources]).slice(0, 10),
    priceBand: {
      highUsd: parsed.price_band.high_usd ?? undefined,
      lowUsd: parsed.price_band.low_usd ?? undefined,
      note: clip(parsed.price_band.note, TEXT_MAX),
    },
    risks: parsed.risks.slice(0, LIST_MAX).map((risk) => clip(risk, TEXT_MAX)),
    saturation: clip(parsed.saturation, TEXT_MAX),
    whyNow: clip(parsed.why_now, TEXT_MAX),
    ...(summary !== undefined && {
      summary: {
        price: sentencesWithin(summary.price, LINE_MAX),
        risks: summary.risks
          .filter((risk) => risk.trim() !== "")
          .slice(0, SUMMARY_RISKS_MAX)
          .map((risk) => sentencesWithin(risk, LINE_MAX)),
        saturation: sentencesWithin(summary.saturation, LINE_MAX),
        saturationLevel: saturationLevelOf(summary.saturation_level),
        whyNow: sentencesWithin(summary.why_now, LINE_MAX),
      },
    }),
  };
};

export const readDossier = async (
  client: Pick<TavilyWeb, "getResearch">,
  requestId: string,
  log?: Logger
): Promise<DossierState> => {
  const reply = await external(
    log,
    { operation: "research_read", provider: "tavily" },
    async () => await client.getResearch(requestId)
  );
  if (reply.status === "failed") {
    return { error: "Tavily research failed", status: "failed" };
  }
  if (reply.status !== "completed" || !("content" in reply)) {
    return { status: "pending" };
  }
  const done = reply as TavilyGetResearchResponse;
  try {
    return {
      dossier: dossierOf(done.content, done.sources ?? []),
      status: "done",
    };
  } catch (error) {
    // Finished, but not in the schema (a report instead of JSON, no why-now
    // answer): reading it again won't change it, so the dossier failed. The
    // caller logs the error.
    return {
      error: `Tavily research returned a dossier wovain can't read: ${clip(
        asError(error).message,
        TITLE_MAX
      )}`,
      status: "failed",
    };
  }
};

// A dossier as saved on its idea: started, then read back until Tavily
// finishes it.
export interface DossierRecord {
  requestId: string;
  // ISO time it started.
  startedAt: string;
  status: "done" | "failed" | "pending";
  dossier?: Dossier | undefined;
  error?: string | undefined;
}
