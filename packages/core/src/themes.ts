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

// Qloo's tags as themes, highest affinity first: Tavily searches each one
// alongside the brief's subject. A tag with no Qloo affinity is no theme.
// Empty when Qloo named no usable tag.
export const qlooThemes = (
  seed: string,
  qloo: { affinity: number; id: string; name: string }[]
): Theme[] => {
  const subject = keywordsOf(seed).join(" ");
  return distinctThemes(
    seed,
    qloo
      .filter(({ affinity }) => affinity > 0)
      .map((theme) => ({
        ...theme,
        query: clip(`${theme.name} ${subject}`, QUERY_MAX),
      }))
  ).slice(0, RUN_THEMES);
};
