import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DesignPreview } from "@/components/app/design-preview";

import messages from "../messages/en.json";

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>
  );

describe("DesignPreview", () => {
  const html = render(
    <DesignPreview artworkUrl="https://example.com/art.png" title="Sun" />
  );

  it("shows the art on a shirt first", () => {
    expect(html).toContain('alt="Design on a shirt: Sun"');
    expect(html).toContain("<svg");
  });

  it("reserves a square frame and a skeleton before the image loads", () => {
    expect(html).toContain("aspect-square");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("opacity-0");
  });

  it("offers the flat art as a second view", () => {
    expect(html).toContain("On a shirt");
    expect(html).toContain("Flat art");
  });
});
