import type { IdeaAudience, IdeaCard } from "@wovain/core/idea-card";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IdeaCardView } from "@/components/ideas/idea-card-view";

import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";

const render = (card: IdeaCard, messages: typeof en = en) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <IdeaCardView card={card} />
    </NextIntlClientProvider>
  );

const buyers: IdeaAudience = {
  ages: ["25-29"],
  agesScope: "idea",
  alsoLikes: [],
  interests: ["Coffee lovers"],
  places: [{ affinity: 0.8, name: "Queens" }],
  scope: "idea",
};

const full: IdeaCard = {
  audience: { status: "ok", value: buyers },
  competition: {
    status: "ok",
    value: {
      citations: [],
      gaps: ["slow mornings"],
      level: "sweet-spot",
      listings: 4,
      medianPrice: 24,
      sampled: 20,
    },
  },
  make: {
    status: "ok",
    value: {
      brief: "Moth and moon line-art crest for night owls",
      concept: "A line-art crest tee for night owls who read in cafés",
      products: ["t-shirt"],
      title: "Moth and moon line-art crest",
    },
  },
  origin: "trends",
  why: {
    status: "ok",
    value: {
      affinity: 0.96,
      citations: [{ title: "Example", url: "https://example.com" }],
      demand: { reason: "not_read", status: "unavailable" },
      qloo: { affinity: 0.96, entities: [] },
      qlooTag: { name: "Romance" },
      sentence: "A K-drama café scene is trending this week.",
      trend: { news: 6 },
    },
  },
};

const SECTION_ORDER = [
  "What to make",
  "Why it sells",
  "Who buys and where",
  "Competition",
];

describe("the fixed idea card", () => {
  it("shows the four sections in one order, with the readable title", () => {
    const html = render(full);
    const at = SECTION_ORDER.map((title) => html.indexOf(title));

    expect(at.every((index) => index >= 0)).toBe(true);
    expect(at).toStrictEqual([...at].toSorted((a, b) => a - b));
    expect(html).toContain("Moth and moon line-art crest");
    expect(html).toContain("Decided by Qloo");
  });

  it("says why a section has no data instead of hiding it", () => {
    const html = render({
      ...full,
      audience: { reason: "not_read", status: "unavailable" },
      competition: { reason: "read_failed", status: "unavailable" },
      make: { reason: "raw_tag", status: "unavailable" },
    });

    for (const title of SECTION_ORDER) {
      expect(html).toContain(title);
    }
    expect(html).toContain("Not available: only the raw Qloo tag came back");
    expect(html).toContain("Not available: not read yet");
    expect(html).toContain("Not available: the read failed");
    expect(html).toContain("Qloo tag “Romance”");
  });

  it("says the buyers are the brief's once, instead of repeating them", () => {
    const html = render({
      ...full,
      audience: {
        status: "ok",
        value: { ...buyers, agesScope: "brief", scope: "brief" },
      },
    });

    expect(html).toContain("Same buyers as your brief.");
  });

  it.each([
    ["es", es],
    ["fr", fr],
  ])("has every reason and section in %s", (_, messages) => {
    for (const reason of Object.keys(en.IdeaCard.reasons)) {
      expect(
        messages.IdeaCard.reasons[reason as keyof typeof en.IdeaCard.reasons]
      ).toBeTruthy();
    }
    expect(Object.keys(messages.IdeaCard.sections)).toStrictEqual(
      Object.keys(en.IdeaCard.sections)
    );
  });
});
