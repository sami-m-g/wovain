// The grounding guard: what an agent writes for the merchant's buyers (ad
// copy, a listing's title and description) may only state numbers and
// claims that the tools gave it. Everything the agent read is its prompt,
// built from tool results (Tavily, Qloo, Fourthwall, the brief); a number
// or a claim that isn't there is one the model made up.
//
// Deterministic on purpose: an LLM checking an LLM for invented facts can
// invent the same fact. A model can still paraphrase a fact into a claim
// this list doesn't know; the ad judges (./judges) catch that kind.

// A number as written: money, grouped thousands, decimals, a percentage.
// `#1a1a1a` (a hex color) and `#1` (a rank claim, see CLAIMS) aren't
// numbers here; a trailing "s" makes a decade ("90s"), a style, not a fact,
// and a number glued to letters is a name ("Y2K", "3D").
const NUMBER =
  /(?<![\w#.])(?<currency>[$€£]?)(?<digits>\d{1,3}(?:,\d{3})+|\d+)(?<fraction>\.\d+)?(?<percent>%?)(?<decade>s\b)?(?![\p{L}\d])/gu;

// Claims a buyer reads as fact. Lowercase; matched case-insensitively.
const CLAIMS = [
  "#1",
  "award-winning",
  "best seller",
  "best-seller",
  "best-selling",
  "bestseller",
  "bestselling",
  "certified",
  "clinically",
  "guaranteed",
  "limited edition",
  "number one",
  "official",
  "proven",
  "sold out",
  "top-rated",
] as const;

// Each claim as a whole word (a plural "s" allowed): "#1" isn't in "#10",
// "official" isn't in "officially", "certified" isn't in "uncertified".
const REGEX_SPECIAL = /[$()*+.?[\\\]^{|}]/gu;
const CLAIM_PATTERNS = CLAIMS.map(
  (claim) =>
    [
      claim,
      new RegExp(
        `(?<![\\p{L}\\d_#])${claim.replaceAll(REGEX_SPECIAL, String.raw`\$&`)}s?(?![\\p{L}\\d_])`,
        "giu"
      ),
    ] as const
);

const valueOf = (digits: string, fraction: string | undefined) =>
  String(Number(`${digits.replaceAll(",", "")}${fraction ?? ""}`));

interface Found {
  at: number;
  // The claim it is, for claims ("best-seller" for "best-sellers").
  claim?: string;
  text: string;
}

const numbersIn = (text: string) =>
  [...text.matchAll(NUMBER)].flatMap((match) => {
    const { currency, decade, digits, fraction, percent } = match.groups ?? {};
    if (digits === undefined || decade !== undefined) {
      return [];
    }
    return [
      {
        at: match.index,
        text: `${currency ?? ""}${digits}${fraction ?? ""}${percent ?? ""}`,
        value: valueOf(digits, fraction),
      },
    ];
  });

// A hex color (#1a1a1a), blanked so its "#1" isn't read as a rank claim.
const HEX_COLOR = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})\b/giu;

// The claims in `text`, read the same way in the copy and in the evidence.
const claimsIn = (text: string): Found[] => {
  const blanked = text.replaceAll(HEX_COLOR, (color) =>
    " ".repeat(color.length)
  );
  return CLAIM_PATTERNS.flatMap(([claim, pattern]) =>
    [...blanked.matchAll(pattern)].map((match) => ({
      at: match.index,
      claim,
      text: match[0],
    }))
  );
};

// The numbers and claims in `text` that `evidence` doesn't contain, in the
// order they appear.
export const unsupportedClaims = (text: string, evidence: string): string[] => {
  const known = new Set(numbersIn(evidence).map((item) => item.value));
  const said = new Set(claimsIn(evidence).map((item) => item.claim));
  const numbers = numbersIn(text).filter((item) => !known.has(item.value));
  const claims = claimsIn(text).filter((item) => !said.has(item.claim));
  return [...numbers, ...claims]
    .toSorted((first, second) => first.at - second.at)
    .map((item) => item.text);
};
