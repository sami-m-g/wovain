import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { TasteMapPanel } from "@/components/app/taste-map";
import type { Idea } from "@/lib/flow-client";

import messages from "../messages/en.json";

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>
  );

const USED: NonNullable<Idea["research"]["taste"]> = {
  affinities: [
    {
      affinity: 0.9,
      because: [{ id: "E1", name: "Studio Ghibli", share: 1 }],
      cues: ["Minimalist"],
      id: "B1",
      name: "Zozotown",
      type: "brand",
    },
  ],
  seeds: [{ id: "E1", name: "Studio Ghibli", type: "artist" }],
  tag: { affinity: 0.9, id: "urn:tag:genre:anime", name: "anime" },
};

it("shows no panel for an idea with no Qloo entity behind it", () => {
  // Saved before Qloo was required.
  const html = render(
    <TasteMapPanel taste={{ affinities: [], failedDomains: [], seeds: [] }} />
  );

  expect(html).toBe("");
});

it("says which Qloo domains failed to load", () => {
  const html = render(
    <TasteMapPanel
      taste={{ ...USED, affinities: [], failedDomains: ["movie", "tv_show"] }}
    />
  );

  expect(html).toContain(
    "Qloo couldn&#x27;t load the films and TV shows these fans like"
  );
});

it("adds no failure note when every domain loaded", () => {
  const withField = render(
    <TasteMapPanel taste={{ ...USED, failedDomains: [] }} />
  );
  // Ideas saved before failedDomains existed have none.
  const older = render(<TasteMapPanel taste={USED} />);

  for (const html of [withField, older]) {
    expect(html).toContain("Zozotown");
    expect(html).not.toContain("couldn&#x27;t load");
  }
});
