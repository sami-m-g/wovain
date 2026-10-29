import { expect, it } from "vitest";

import { freshDraft, switchDraft } from "@/lib/brand-drafts";
import type { BrandDraft, BrandPath, Drafts } from "@/lib/brand-drafts";

type Draft = BrandDraft<string, string>;

const blank: Draft = {
  hex: "",
  niche: "",
  references: ["", "", ""],
  voice: "",
};
const saved: Draft = {
  hex: "#1A1A1A",
  niche: "y2k racing",
  references: ["Wes Anderson", "Kenzo", "Studio Ghibli"],
  voice: "dry",
};
const fresh = (path: BrandPath) => freshDraft(path, saved, blank);

it("starts a suggestion path clean after the manual path", () => {
  const typed: Draft = { ...saved, niche: "my own niche" };
  const { current } = switchDraft<Draft>({}, "manual", "auto", typed, fresh);
  expect(current).toStrictEqual(blank);
});

it("gives each path back its own draft", () => {
  const typed: Draft = { ...saved, niche: "my own niche" };
  const fromCard: Draft = {
    card: "Moss & Melody",
    hex: "",
    niche: "indie music festival lovers",
    palette: "warm sunset glow",
    references: ["HONNE", "Willow", "The First Lady"],
    voice: "Made for long summer evenings.",
  };
  let drafts: Drafts<Draft> = {};
  // Manual, then Suggest for me: a card fills the fields.
  ({ drafts } = switchDraft(drafts, "manual", "auto", typed, fresh));
  // Back to manual: the typed draft, not the card's values.
  const back = switchDraft(drafts, "auto", "manual", fromCard, fresh);
  expect(back.current).toStrictEqual(typed);
  // And Suggest for me again: the card's draft.
  const again = switchDraft(back.drafts, "manual", "auto", back.current, fresh);
  expect(again.current).toStrictEqual(fromCard);
  // The questionnaire was never visited: clean.
  const asked = switchDraft(
    again.drafts,
    "auto",
    "questions",
    again.current,
    fresh
  );
  expect(asked.current).toStrictEqual(blank);
});

it("starts the manual path from what was saved", () => {
  expect(
    switchDraft<Draft>({}, undefined, "manual", blank, fresh).current
  ).toStrictEqual(saved);
});
