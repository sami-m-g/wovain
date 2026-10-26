import { describe, expect, it, vi } from "vitest";

import { contentMetadata, ogImages } from "@/lib/seo";

vi.mock("@/env.server", () => ({
  ENV: { BETTER_AUTH_URL: "https://wovain.com", MCP_URL: undefined },
}));
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "en" ? href : `/${locale}${href}`,
}));
vi.mock("@/i18n/routing", () => ({
  routing: { defaultLocale: "en", locales: ["en", "fr", "es"] },
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

describe("og:image", () => {
  it("points the default locale at the unprefixed card", () => {
    expect(ogImages("en")[0]?.url).toBe(
      "https://wovain.com/opengraph-image/og"
    );
  });

  it("points other locales at their own card", () => {
    expect(ogImages("fr")[0]?.url).toBe(
      "https://wovain.com/fr/opengraph-image/og"
    );
  });

  it("is set on content pages so the file convention cannot drop it", () => {
    const { openGraph } = contentMetadata({
      description: "d",
      locale: "es",
      path: "/guides",
      title: "t",
    });
    expect(openGraph?.images).toEqual(ogImages("es"));
  });
});
