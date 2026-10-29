// The themes a run researches: the tags Qloo's taste graph says the seed's
// fans share, and nothing else. No theme is made up from the brief: when Qloo
// matches nothing the run stops (./trends). The brief itself is never a
// theme: an idea's title is a theme, not the brief echoed.

// Themes one run researches: one Tavily search pair each.
export const RUN_THEMES = 3;
export const MAX_THEMES = 5;
// Tavily caps a query at 400 characters.
export const QUERY_MAX = 400;
// A display cap, not a validation rule: a long name is cut, never rejected.
export const NAME_MAX = 120;

export interface Theme {
  // Qloo's affinity of the theme with the seed's fans.
  affinity?: number | undefined;
  // A Qloo tag of another of the brief's concepts, paired with this one so
  // the theme carries more of the brief.
  bridge?: { id: string; name: string } | undefined;
  // The brief's concepts the theme (with its bridge) belongs to.
  concepts?: string[] | undefined;
  // Qloo tag ID, when the theme came from Qloo.
  id?: string | undefined;
  name: string;
  // What Tavily searches for this theme.
  query: string;
}

const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "apparel",
  "brief",
  "design",
  "designs",
  "for",
  "from",
  "i",
  "in",
  "into",
  "is",
  "it",
  "make",
  "me",
  "merch",
  "my",
  "of",
  "on",
  "or",
  "our",
  "print",
  "prints",
  "shirt",
  "shirts",
  "shop",
  "some",
  "store",
  "t",
  "tee",
  "tees",
  "that",
  "the",
  "this",
  "to",
  "tshirt",
  "tshirts",
  "want",
  "we",
  "with",
]);
const WORD = /[\p{L}\p{N}]+/gu;
const KEYWORDS_MAX = 4;

export const clip = (value: string, max: number) => {
  const trimmed = value.trim().replaceAll(/\s+/gu, " ");
  return trimmed.length <= max
    ? trimmed
    : `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

const wordsOf = (value: string) =>
  [...value.toLowerCase().matchAll(WORD)].map(([word]) => word);

// The brief's subject words, merch filler removed ("Spooky Halloween tees
// for horror fans" → "spooky halloween horror fans").
export const keywordsOf = (seed: string) => {
  const words = wordsOf(seed).filter(
    (word) => word.length > 1 && !STOPWORDS.has(word)
  );
  return [...new Set(words)].slice(0, KEYWORDS_MAX);
};

// One key per theme: case, punctuation and word order don't make a new one.
export const themeKey = (name: string) =>
  [...new Set(wordsOf(name).filter((word) => !STOPWORDS.has(word)))]
    .toSorted()
    .join(" ");

// Distinct themes, none of them the brief, at most MAX_THEMES.
export const distinctThemes = (seed: string, themes: Theme[]): Theme[] => {
  const seen = new Set([themeKey(seed), ""]);
  return themes
    .filter(({ name }) => {
      const key = themeKey(name);
      const fresh = !seen.has(key);
      seen.add(key);
      return fresh;
    })
    .slice(0, MAX_THEMES);
};

interface QlooTag {
  affinity: number;
  // The brief's concepts the tag belongs to (./qloo QlooTheme).
  concepts?: string[] | undefined;
  id: string;
  name: string;
}

const searchOf = (names: string[], subject: string) =>
  clip([...names, subject].join(" "), QUERY_MAX);

const coverOf = (tags: QlooTag[]) =>
  new Set(tags.flatMap((tag) => tag.concepts ?? []));

// A brief of several concepts ("Gothic botanical tees for plant lovers who
// like dark academia"): a theme must carry the brief, not one corner of it.
// Tags are ranked by how many of the brief's concepts they belong to, then
// by Qloo affinity; each pick leads with a concept the others don't, and a
// tag that covers only part of the brief is paired with the best tag of a
// concept it misses (Gothic with Botany), so every theme bridges at least
// two concepts when Qloo knows two.
const conceptThemes = (
  seed: string,
  qloo: QlooTag[],
  concepts: readonly string[]
): Theme[] => {
  const subject = keywordsOf(seed).join(" ");
  const seen = new Set([themeKey(seed), ""]);
  // The tag is one of the brief's concepts itself ("gothic").
  const isOwn = (tag: QlooTag) =>
    concepts.some((concept) => themeKey(concept) === themeKey(tag.name));
  const candidates = qloo
    .filter(({ affinity }) => affinity > 0)
    .filter(({ name }) => {
      const key = themeKey(name);
      const fresh = !seen.has(key);
      seen.add(key);
      return fresh;
    })
    .toSorted(
      (a, b) =>
        (b.concepts?.length ?? 0) - (a.concepts?.length ?? 0) ||
        Number(isOwn(b)) - Number(isOwn(a)) ||
        b.affinity - a.affinity
    );
  // A concept's own tag ("Dark Academia") first, then its closest one.
  const bestFor = (concept: string, not: QlooTag) => {
    const of = candidates.filter(
      (tag) => tag !== not && (tag.concepts ?? []).includes(concept)
    );
    return of.find((tag) => themeKey(tag.name) === themeKey(concept)) ?? of[0];
  };
  const picked: QlooTag[] = [];
  const led = new Set<string>();
  // Each concept leads one theme, best covered first; then the rest by rank.
  for (const tag of candidates) {
    const leads = (tag.concepts ?? []).some((concept) => !led.has(concept));
    if (leads && picked.length < RUN_THEMES) {
      picked.push(tag);
      for (const concept of tag.concepts ?? []) {
        led.add(concept);
      }
    }
  }
  for (const tag of candidates) {
    if (picked.length < RUN_THEMES && !picked.includes(tag)) {
      picked.push(tag);
    }
  }
  return picked.map((tag) => {
    const own = coverOf([tag]);
    // The concept the theme misses that comes next after its own, so the
    // pairs go round the brief (gothic + botanical, botanical + dark
    // academia, dark academia + gothic).
    const lead = concepts.findIndex((concept) => own.has(concept));
    const missing = [
      ...concepts.slice(lead + 1),
      ...concepts.slice(0, lead + 1),
    ].find((concept) => !own.has(concept));
    const bridge =
      own.size === 0 || missing === undefined
        ? undefined
        : bestFor(missing, tag);
    const covered = concepts.filter((concept) =>
      coverOf(bridge === undefined ? [tag] : [tag, bridge]).has(concept)
    );
    return {
      affinity:
        bridge === undefined
          ? tag.affinity
          : (tag.affinity + bridge.affinity) / 2,
      ...(bridge !== undefined && {
        bridge: { id: bridge.id, name: bridge.name },
      }),
      concepts: covered,
      id: tag.id,
      name: tag.name,
      query: searchOf(
        bridge === undefined ? [tag.name] : [tag.name, bridge.name],
        subject
      ),
    };
  });
};

// Qloo's tags as themes, highest affinity first: Tavily searches each one
// alongside the brief's subject. A tag with no Qloo affinity is no theme.
// Empty when Qloo named no usable tag. With the brief's concepts known
// (./qloo TasteOptions.concepts), see conceptThemes.
export const qlooThemes = (
  seed: string,
  qloo: QlooTag[],
  concepts: readonly string[] = []
): Theme[] => {
  if (concepts.length > 1) {
    return conceptThemes(seed, qloo, concepts);
  }
  const subject = keywordsOf(seed).join(" ");
  return distinctThemes(
    seed,
    qloo
      .filter(({ affinity }) => affinity > 0)
      .map(({ affinity, concepts: covered, id, name }) => ({
        affinity,
        ...(covered !== undefined && { concepts: covered }),
        id,
        name,
        query: searchOf([name], subject),
      }))
  ).slice(0, RUN_THEMES);
};
