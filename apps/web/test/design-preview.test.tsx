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

const ART = "https://example.com/art.png";
const MOCKUP = "https://cdn.fourthwall.com/mock/front.png";

describe("DesignPreview", () => {
  it("shows Fourthwall's mockup on a shirt first", () => {
    const html = render(
      <DesignPreview
        artworkUrl={ART}
        mockupStatus="ready"
        mockups={[MOCKUP]}
        title="Sun"
      />
    );
    expect(html).toContain(
      'alt="Design on a shirt, as Fourthwall renders it: Sun"'
    );
    expect(html).toContain(MOCKUP);
    expect(html).not.toContain(ART);
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<output");
  });

  it("reserves a square frame and a skeleton before the image loads", () => {
    const html = render(<DesignPreview artworkUrl={ART} title="Sun" />);
    expect(html).toContain("aspect-square");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("opacity-0");
  });

  it("offers the flat art as a second view", () => {
    const html = render(<DesignPreview artworkUrl={ART} title="Sun" />);
    expect(html).toContain("On a shirt");
    expect(html).toContain("Flat art");
  });

  it("shows the flat art with a notice when the preview failed", () => {
    const html = render(
      <DesignPreview artworkUrl={ART} mockupStatus="failed" title="Sun" />
    );
    expect(html).toContain('alt="Design: Sun"');
    expect(html).toContain(ART);
    expect(html).toContain(
      "Fourthwall couldn&#x27;t render this design on the shirt. Showing the flat art."
    );
  });

  it("asks to connect Fourthwall when there is no shop to render on", () => {
    const html = render(
      <DesignPreview
        artworkUrl={ART}
        mockupStatus="not_connected"
        title="Sun"
      />
    );
    expect(html).toContain(ART);
    expect(html).toContain(
      "Connect Fourthwall to see this design on the shirt."
    );
  });
});
