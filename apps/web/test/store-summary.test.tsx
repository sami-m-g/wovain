import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreDashboard } from "@/components/store/store-dashboard";
import { StoreSetup } from "@/components/store/store-setup";
import { StoreSummary } from "@/components/store/store-summary";
import type { StoreReadiness, StoreSetup as Setup } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

import messages from "../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard/store",
  useSearchParams: () => new URLSearchParams(""),
}));

const render = (
  node: React.ReactNode,
  seed: (client: QueryClient) => void = () => {}
) => {
  const client = new QueryClient();
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
};

const checks = (failing: string[]): StoreReadiness["checks"] =>
  (["site_live", "verified", "store_role", "shipping", "payouts"] as const).map(
    (id) => ({ blocking: id !== "payouts", id, ok: !failing.includes(id) })
  );

const shop = (patch: Partial<StoreReadiness["shop"]> = {}) => ({
  baseUrl: "https://atelier.fourthwall.com",
  name: "Atelier",
  payoutStatus: "ACTIVE",
  siteStatus: "LIVE",
  ...patch,
});

const seedNumbers = (client: QueryClient, pending = 0) => {
  client.setQueryData(orpc.store.sales.queryKey({ input: { range: "28d" } }), {
    products: [],
    series: [],
    totals: { orders: 12, profit: 400, revenue: 1234 },
  });
  client.setQueryData(
    orpc.approvals.list.queryKey({
      input: { domain: "store", limit: 30, statuses: ["pending"] },
    }),
    Array.from({ length: pending }, (_, index) => ({
      id: `a${index}`,
    })) as never
  );
};

const noop = () => {};

describe("StoreSummary", () => {
  it("puts a coming-soon shop's fix on one line: go live", () => {
    const html = render(
      <StoreSummary
        onApprovals={noop}
        readiness={{
          checks: checks(["site_live"]),
          ready: false,
          shop: shop({ siteStatus: "COMING_SOON" }),
        }}
      />,
      (client) => seedNumbers(client)
    );
    expect(html).toContain("Coming soon");
    expect(html).toContain("Shop is live");
    expect(html).toContain("(4 of 5 checks pass)");
    expect(html).toContain("Go live");
    expect(html).toContain("Nothing to approve");
  });

  it("shows sales, orders, what waits and payouts from Fourthwall", () => {
    const html = render(
      <StoreSummary
        onApprovals={noop}
        readiness={{ checks: checks([]), ready: true, shop: shop() }}
      />,
      (client) => seedNumbers(client, 2)
    );
    expect(html).toContain("Ready to sell");
    expect(html).toContain("$1,234.00");
    expect(html).toContain(">12<");
    expect(html).toContain("Review");
    expect(html).toContain("Set up");
    expect(html).not.toContain("Go live");
  });

  it("links unfinished payouts to Fourthwall's settings", () => {
    const html = render(
      <StoreSummary
        onApprovals={noop}
        readiness={{
          checks: checks(["payouts"]),
          ready: true,
          shop: shop({ payoutStatus: "IN_PROGRESS" }),
        }}
      />,
      (client) => seedNumbers(client)
    );
    expect(html).toContain("Finishing");
    expect(html).toContain(
      "https://admin.fourthwall.com/?redirectPath=%2Fsettings%2F"
    );
  });
});

describe("StoreDashboard", () => {
  it("shows one connect state, never an error, without Fourthwall", () => {
    const html = render(<StoreDashboard />, (client) => {
      client.setQueryData(orpc.connections.list.queryKey(), []);
    });
    expect(html).toContain("Connect Fourthwall to open your shop here");
    expect(html).not.toContain("Products</button>");
    expect(html).not.toContain('role="alert"');
  });
});

const SETUP: Setup = {
  domain: null,
  metaConnected: true,
  pixel: { datasetId: "939178269202011", firing: false },
  pixelAutomation: false,
  shop: {
    baseUrl: "https://atelier.fourthwall.com",
    hosts: ["atelier.fourthwall.com"],
    name: "Atelier",
    payoutStatus: "INACTIVE",
    siteStatus: "COMING_SOON",
  },
  steps: [
    { how: "none", id: "connect", required: true, state: "done" },
    { how: "link", id: "payouts", required: true, state: "todo" },
    { how: "do_it", id: "site_live", required: true, state: "todo" },
    { how: "none", id: "shipping", required: true, state: "done" },
    { how: "link", id: "pixel", required: true, state: "todo" },
    { how: "link", id: "domain", required: false, state: "check" },
    { how: "link", id: "policies", required: false, state: "check" },
  ],
};

describe("StoreSetup", () => {
  it("lists each step with its way to get it done", () => {
    const html = render(<StoreSetup />, (client) => {
      client.setQueryData(orpc.store.setup.queryKey(), SETUP);
    });
    expect(html).toContain("Get your shop ready to sell");
    expect(html).toContain("2 of 5 done");
    expect(html).toContain("Go live");
    expect(html).toContain("Open Billing and payouts");
    expect(html).toContain("redirectPath=%2Fsettings%2Fbilling%2F");
    expect(html).toContain("Fourthwall support set up my payouts");
    expect(html).toContain("939178269202011");
    expect(html).toContain(
      "redirectPath=%2Fanalytics%2Foverview%2Ftracking-pixels"
    );
    expect(html).toContain("Open Meta Conversions");
    expect(html).toContain("Open your storefront (test visit)");
  });

  it("shows payouts the merchant marked done", () => {
    const html = render(<StoreSetup />, (client) => {
      client.setQueryData(orpc.store.setup.queryKey(), {
        ...SETUP,
        steps: SETUP.steps.map((step) =>
          step.id === "payouts"
            ? {
                ...step,
                confirmedByMerchant: true,
                how: "none" as const,
                state: "done" as const,
              }
            : step
        ),
      });
    });
    expect(html).toContain(
      "You marked payouts as set up by Fourthwall support"
    );
    expect(html).not.toContain("Fourthwall support set up my payouts");
  });

  it("offers to set up the pixel when Meta has none, and to test it after", () => {
    const none = render(<StoreSetup />, (client) => {
      client.setQueryData(orpc.store.setup.queryKey(), {
        ...SETUP,
        pixel: null,
        pixelAutomation: true,
      });
    });
    expect(none).toContain("Set up my pixel");
    expect(none).not.toContain("didn&#x27;t find exactly one pixel");
    const found = render(<StoreSetup />, (client) => {
      client.setQueryData(orpc.store.setup.queryKey(), {
        ...SETUP,
        pixelAutomation: true,
      });
    });
    expect(found).toContain("Send a test event");
    expect(found).toContain("939178269202011");
  });
});
