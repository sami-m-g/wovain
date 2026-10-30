import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProductsStep } from "@/components/app/wizard-steps";
import type { Product } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

import messages from "../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const product = {
  designId: "d1",
  id: "p1",
  mockups: [],
  price: 28,
  productUrl: null,
  status: "hidden",
} as unknown as Product;

const RULES = {
  cardFeeFixed: 0.3,
  cardFeePct: 2.9,
  minMarginPct: 30,
  minProfit: 10,
  refundReservePct: 2,
  salesTaxPct: 0,
  shipping: 0,
  sizeSurcharges: { "2XL": 2 },
};

const render = (seed: (client: QueryClient) => void) => {
  const client = new QueryClient();
  seed(client);
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

describe("ProductsStep price breakdown", () => {
  it("shows the base cost, profit, margin and the rule behind the price", () => {
    const html = render((client) =>
      client.setQueryData(
        orpc.store.priceCheck.queryKey({ input: { productId: "p1" } }),
        { check: null, costs: { "2XL": 15, M: 12 }, price: 28, rules: RULES }
      )
    );
    // M: 28 - 12 - (28 x 2.9% + 0.30) - 28 x 2% = 14.33; 14.33 / 28 = 51%,
    // the margin after fees the rule speaks of.
    expect(html).toContain("Base cost $12.00");
    expect(html).toContain("your profit $14.33 per sale");
    expect(html).toContain("51% margin");
    expect(html).toContain("at least $10.00 profit and 30% margin");
  });

  it("shows only the price until Fourthwall's cost is read", () => {
    const html = render(() => {});
    expect(html).toContain("$28.00");
    expect(html).not.toContain("Base cost");
  });
});
