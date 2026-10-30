import type { Memory } from "@mastra/memory";
import type { Logger } from "@wovain/core/log";
import type { Nemotron } from "@wovain/core/nemotron";
import type { QlooEntity } from "@wovain/core/qloo";
import type { TraceSource } from "@wovain/core/trace";
import type { TavilySearch } from "@wovain/core/trends";
import { log as evlog } from "evlog";
import { z } from "zod";

import { TASTE_TEMPLATE, tasteThread } from "./taste";

// A designer's brand identity from the taste references they name (3 to 5
// artists, films, brands). Each reference resolves to Qloo entities: first
// directly with Qloo /search, then, when Qloo doesn't know it, through
// "cultural proxies": a web search for the reference, Nemotron naming the
// concrete entities the results mention, and each of those looked up in
// Qloo. Entity IDs only ever come from Qloo; a reference neither path finds
// is reported unresolved, never given an invented entity.
//
// The cultural-proxies technique is ported from Alloy
// (https://github.com/MR-GREEN1337/alloy, backend/src/services/react_agent.py,
// `_extract_cultural_proxies` and `_get_tastes_for_term`), under the MIT
// License in that repository's LICENSE file.

export const MIN_REFERENCES = 3;
export const MAX_REFERENCES = 5;
const MAX_PROXIES = 5;
const WEB_RESULTS = 5;
const WEB_CONTENT_MAX = 600;

// A Qloo entity a reference resolved to, as `brand_profile.qloo_entities`
// keeps it (@wovain/db/schema/autonomy's QlooEntityRef).
export interface BrandEntity {
  // The reference it was found through, when it is a proxy.
  from?: string | undefined;
  id: string;
  name: string;
  score?: number | undefined;
  type: string;
}

export type ReferenceStatus = "direct" | "proxy" | "unresolved";

export interface ResolvedReference {
  entities: BrandEntity[];
  // A provider failed for this reference (logged at error level).
  failed: boolean;
  reference: string;
  // The web pages the proxies were read from.
  sources: TraceSource[];
  status: ReferenceStatus;
}

export interface ReferenceDeps {
  ask: Nemotron;
  log?: Logger | undefined;
  search: (
    query: string,
    options?: { log?: Logger | undefined; take?: number }
  ) => Promise<QlooEntity[]>;
  web: TavilySearch;
}

const proxiesSchema = z.object({
  proxies: z.array(z.string().trim().min(1).max(120)).max(MAX_PROXIES),
});

const PROXIES_SYSTEM = `You read web search results about a designer's taste reference (an artist, label, film, brand or person) and list the ${MIN_REFERENCES} to ${MAX_PROXIES} most culturally significant named entities the text associates with it. Name only concrete, searchable things that appear in the text: specific products, films, TV shows, games, books, musicians, designers, spokespeople or sub-brands. Never name abstract ideas ("minimalism", "innovation"), never name the reference itself, and never add anything the text doesn't mention. If the text names nothing concrete, answer an empty list. Answer JSON: {"proxies": string[]}.`;

const failure = (reference: string, step: string, error: unknown) => {
  evlog.error({
    error: "ONBOARDING_REFERENCE_FAILED",
    reason: error instanceof Error ? error.message : String(error),
    reference,
    step,
  });
};

const asEntity = (entity: QlooEntity, from?: string): BrandEntity => ({
  id: entity.id,
  name: entity.name,
  type: entity.type,
  ...(from === undefined ? {} : { from }),
  ...(entity.popularity === undefined ? {} : { score: entity.popularity }),
});

// Qloo's best match for one name, or undefined; a failure is logged and
// reads as no match, so the other names still resolve.
const lookUp = async (
  deps: ReferenceDeps,
  reference: string,
  name: string
): Promise<{ entity?: QlooEntity; failed: boolean }> => {
  try {
    const [entity] = await deps.search(name, { log: deps.log, take: 1 });
    return entity === undefined ? { failed: false } : { entity, failed: false };
  } catch (error) {
    failure(reference, "qloo_search", error);
    return { failed: true };
  }
};

const viaProxies = async (
  deps: ReferenceDeps,
  reference: string
): Promise<ResolvedReference> => {
  const unresolved = (failed: boolean, sources: TraceSource[] = []) => ({
    entities: [],
    failed,
    reference,
    sources,
    status: "unresolved" as const,
  });
  let results: { content: string; title: string; url: string }[];
  try {
    const reply = await deps.web.search(
      `"${reference}" designer brand aesthetic influences collaborations`,
      { maxResults: WEB_RESULTS, searchDepth: "basic" }
    );
    ({ results } = reply);
  } catch (error) {
    failure(reference, "tavily_search", error);
    return unresolved(true);
  }
  const sources = results.map((result): TraceSource => ({
    provider: "tavily",
    title: result.title,
    url: result.url,
  }));
  if (results.length === 0) {
    return unresolved(false);
  }
  let proxies: string[];
  try {
    ({ proxies } = await deps.ask({
      log: deps.log,
      name: "brand_proxies",
      prompt: `Reference: ${reference}\n\nWeb results:\n${results
        .map(
          (result, index) =>
            `[${index + 1}] ${result.title}\n${result.content.slice(0, WEB_CONTENT_MAX)}`
        )
        .join("\n\n")}`,
      schema: proxiesSchema,
      system: PROXIES_SYSTEM,
      temperature: 0,
    }));
  } catch (error) {
    failure(reference, "nemotron_proxies", error);
    return unresolved(true, sources);
  }
  const named = [
    ...new Set(
      proxies.filter((proxy) => proxy.toLowerCase() !== reference.toLowerCase())
    ),
  ];
  const found = await Promise.all(
    named.map(async (proxy) => await lookUp(deps, reference, proxy))
  );
  const seen = new Set<string>();
  const entities = found.flatMap(({ entity }) => {
    if (entity === undefined || seen.has(entity.id)) {
      return [];
    }
    seen.add(entity.id);
    return [asEntity(entity, reference)];
  });
  const failed = found.some((one) => one.failed);
  return entities.length === 0
    ? unresolved(failed, sources)
    : { entities, failed, reference, sources, status: "proxy" };
};

const resolveOne = async (
  deps: ReferenceDeps,
  reference: string
): Promise<ResolvedReference> => {
  const direct = await lookUp(deps, reference, reference);
  if (direct.entity !== undefined) {
    return {
      entities: [asEntity(direct.entity)],
      failed: false,
      reference,
      sources: [],
      status: "direct",
    };
  }
  const proxied = await viaProxies(deps, reference);
  return direct.failed ? { ...proxied, failed: true } : proxied;
};

// Two spellings of one reference ("Kenzo", " kenzo") share a key.
export const referenceKey = (reference: string) =>
  reference.trim().toLowerCase();

// The references trimmed, blanks and repeats dropped; the first spelling of
// each wins.
export const distinctReferences = (references: readonly string[]) => {
  const seen = new Set<string>();
  return references
    .map((reference) => reference.trim())
    .filter((reference) => {
      const key = referenceKey(reference);
      const fresh = key !== "" && !seen.has(key);
      seen.add(key);
      return fresh;
    });
};

// Every reference resolves on its own: one failing never stops the rest.
export const resolveReferences = async (
  deps: ReferenceDeps,
  references: readonly string[]
): Promise<ResolvedReference[]> =>
  await Promise.all(
    distinctReferences(references).map(
      async (reference) => await resolveOne(deps, reference)
    )
  );

export interface BrandMemory {
  niches: readonly string[];
  palette: readonly string[];
  voice?: string | null | undefined;
}

const LINES = {
  niches: "- Niches:",
  palette: "- Palette and typography:",
  voice: "- Voice:",
} as const;

// The taste memory with its Voice, Palette and Niches lines set from the
// brand; every other line (the approved and rejected designs) stays.
export const withBrandLines = (current: string, brand: BrandMemory) => {
  const values: Record<keyof typeof LINES, string> = {
    niches: brand.niches.join(", "),
    palette: brand.palette.join(", "),
    voice: brand.voice?.trim() ?? "",
  };
  const lines = current.split("\n");
  for (const key of Object.keys(LINES) as (keyof typeof LINES)[]) {
    const heading = LINES[key];
    const line = values[key] === "" ? heading : `${heading} ${values[key]}`;
    const at = lines.findIndex((each) => each.startsWith(heading));
    if (at === -1) {
      lines.splice(1, 0, line);
    } else {
      lines[at] = line;
    }
  }
  return lines.join("\n");
};

// Writes the brand into the merchant's working memory, the one the brief
// writer and the ad copywriter read.
export const writeBrandMemory = async (
  memory: Memory,
  userId: string,
  brand: BrandMemory
) => {
  const threadId = tasteThread(userId);
  const current =
    (await memory.getWorkingMemory({ resourceId: userId, threadId })) ??
    TASTE_TEMPLATE;
  await memory.updateWorkingMemory({
    resourceId: userId,
    threadId,
    workingMemory: withBrandLines(current, brand),
  });
};
