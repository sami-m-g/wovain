// One draft of the brand step's fields per way in (Suggest for me, the
// questionnaire, "I already know my brand"), so switching ways never mixes
// one path's values into another's: leaving a path keeps its draft, and a
// path starts from its own draft or clean.

export type BrandPath = "auto" | "manual" | "questions";

export interface BrandDraft<Card, Palette> {
  // The starter card the fields came from, if one was picked.
  card?: Card | undefined;
  hex: string;
  niche: string;
  palette?: Palette | undefined;
  references: string[];
  voice: string;
}

export type Drafts<D> = Partial<Record<BrandPath, D>>;

// The draft to show on `to`, and the drafts with `from`'s current one kept.
export const switchDraft = <D>(
  drafts: Drafts<D>,
  from: BrandPath | undefined,
  to: BrandPath,
  current: D,
  fresh: (path: BrandPath) => D
): { current: D; drafts: Drafts<D> } => {
  const kept = from === undefined ? drafts : { ...drafts, [from]: current };
  return { current: kept[to] ?? fresh(to), drafts: kept };
};

// A path's first draft: "I already know my brand" starts from what was
// saved; the suggestion paths start clean until a card is picked.
export const freshDraft = <Card, Palette>(
  path: BrandPath,
  saved: BrandDraft<Card, Palette>,
  blank: BrandDraft<Card, Palette>
): BrandDraft<Card, Palette> => (path === "manual" ? saved : blank);
