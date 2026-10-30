import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DossierView } from "@/components/app/idea-dossier";

import messages from "../messages/en.json";

vi.mock("@/utils/orpc", () => ({ orpc: {} }));

const LONG =
  "Chinese drama viewership is at a peak with record-breaking series in 2026 and strong international buzz in 2025, and the genre is still growing.";

describe("the dossier at a glance", () => {
  it("wraps a long sentence whole, with no ellipsis or clamp", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <DossierView
          dossier={{
            citations: [],
            priceBand: { note: "" },
            risks: [],
            saturation: "",
            summary: { price: "", risks: [], saturation: "", whyNow: LONG },
            whyNow: LONG,
          }}
        />
      </NextIntlClientProvider>
    );

    expect(html).toContain(LONG);
    expect(html).not.toContain("…");
    expect(html).not.toMatch(/truncate|line-clamp/u);
  });
});
