import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProductsStep } from "@/components/app/wizard-steps";
import type { Product, StoreReadiness } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

import messages from "../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard",
  useSearchParams: () => new URLSearchParams(""),
}));

const product = {
  designId: "d1",
  id: "p1",
  mockups: [],
  price: 28,
  productUrl: null,
  status: "in_review",
} as unknown as Product;

const render = (readiness?: StoreReadiness) => {
  const client = new QueryClient();
  if (readiness) {
    client.setQueryData(orpc.store.readiness.queryKey(), readiness);
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ProductsStep
          onNext={() => {}}
          onPublish={() => {}}
          products={[product]}
          titles={{ d1: "Moon Court Fan" }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
};

const readiness = (failing: string[]): StoreReadiness => ({
  checks: (["site_live", "verified", "shipping", "payouts"] as const).map(
    (id) => ({ blocking: id !== "payouts", id, ok: !failing.includes(id) })
  ),
  ready: failing.every((id) => id === "payouts"),
  shop: {
    baseUrl: "https://atelier.fourthwall.com",
    name: "Atelier",
    payoutStatus: "ACTIVE",
    siteStatus: failing.includes("site_live") ? "COMING_SOON" : "LIVE",
  },
});

const PUBLISH_BUTTON =
  /<button[^>]*>(?:(?!<\/button>).)*Publish to Fourthwall/u;

describe("ProductsStep", () => {
  it("fixes a shop that can't take orders in the flow, not in the Store", () => {
    const html = render(readiness(["site_live", "shipping"]));
    expect(html).toContain("Fix these before anything goes public.");
    expect(html).toContain("Shop is live");
    expect(html).toContain("Go live");
    expect(html).toContain("Shipping is on");
    expect(html.match(PUBLISH_BUTTON)?.[0]).toContain(' disabled=""');
  });

  it("publishes straight away once the shop is ready", () => {
    const html = render(readiness([]));
    expect(html).not.toContain("Fix these before anything goes public.");
    expect(html.match(PUBLISH_BUTTON)?.[0]).not.toContain(' disabled=""');
  });

  it("leaves publishing open when readiness can't be read", () => {
    const html = render();
    expect(html.match(PUBLISH_BUTTON)?.[0]).not.toContain(' disabled=""');
  });
});
