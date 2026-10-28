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

const valueOf = (digits: string, fraction: string | undefined) =>
  String(Number(`${digits.replaceAll(",", "")}${fraction ?? ""}`));

interface Found {
  at: number;
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

const claimsIn = (text: string): Found[] => {
  const lower = text
    .toLowerCase()
    .replaceAll(HEX_COLOR, (color) => " ".repeat(color.length));
  return CLAIMS.flatMap((claim) => {
    const found: Found[] = [];
    let at = lower.indexOf(claim);
    while (at !== -1) {
      found.push({ at, text: text.slice(at, at + claim.length) });
      at = lower.indexOf(claim, at + claim.length);
    }
    return found;
  });
};

// The numbers and claims in `text` that `evidence` doesn't contain, in the
// order they appear.
export const unsupportedClaims = (text: string, evidence: string): string[] => {
  const known = new Set(numbersIn(evidence).map((item) => item.value));
  const said = evidence.toLowerCase();
  const numbers = numbersIn(text).filter((item) => !known.has(item.value));
  const claims = claimsIn(text).filter(
    (item) => !said.includes(item.text.toLowerCase())
  );
  return [...numbers, ...claims]
    .toSorted((first, second) => first.at - second.at)
    .map((item) => item.text);
};
