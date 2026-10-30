import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CampaignStep } from "@/components/app/campaign-step";
import { resumeStep } from "@/components/app/use-drop-flow";
import { sectionState } from "@/components/drops/drop-sections";
import type {
  Campaign,
  Connection,
  Product,
  RunDetail,
} from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

import messages from "../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard/new",
  useSearchParams: () => new URLSearchParams("run=r1&step=campaign"),
}));

const noop = () => {};

const live = {
  designId: "d1",
  id: "p1",
  mockups: ["https://cdn.example/front.png", "https://cdn.example/back.png"],
  price: 32,
  productUrl: "https://shop.example/dune-tee",
  status: "public",
} as unknown as Product;

const staged = {
  adAccountId: "1",
  copy: [
    { angle: "Dusk", headline: "Wear the desert at dusk", message: "Soft." },
  ],
  dailyBudgetCents: 1500,
  id: "c1",
  metaCampaignId: "2",
  status: "paused",
} as unknown as Campaign;

const render = (
  campaigns: Campaign[],
  connections: { provider: string; needsReconnect: boolean }[],
  products: Product[] = [live]
) => {
  const client = new QueryClient();
  client.setQueryData(
    orpc.connections.list.queryKey(),
    connections as unknown as Connection[]
  );
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <CampaignStep
          budget="15"
          budgetInvalid={false}
          campaigns={campaigns}
          onBack={noop}
          onBudget={noop}
          onLaunched={noop}
          onStage={noop}
          products={products}
          titles={{ d1: "Dune Tee" }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
};

const META = [{ needsReconnect: false, provider: "meta" }];

describe("the campaign step", () => {
  it("shows the creatives and asks to connect Meta before launching", () => {
    const html = render([], []);
    expect(html).toContain("Dune Tee, ad image");
    expect(html).toContain("https://cdn.example/back.png");
    expect(html).toContain("Connect Meta to launch");
    expect(html).toContain('href="/dashboard/store#setup"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Launch campaign/u);
    expect(html).not.toContain("Daily budget (USD)");
  });

  it("with Meta, shows the budget and one Launch campaign", () => {
    const html = render([], META);
    expect(html).not.toContain("Connect Meta to launch");
    expect(html).toContain("Daily budget (USD)");
    expect(html).toContain("wovain writes three ad variants");
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Launch campaign/u);
  });

  it("plays each product's video ad clips, muted, next to its images", () => {
    const withVideos = {
      ...live,
      videos: [{ aspect: "9:16", url: "https://fal.example/tall.mp4" }],
    } as unknown as Product;
    const html = render([], META, [withVideos]);
    expect(html).toContain("https://cdn.example/front.png");
    expect(html).toMatch(
      /<video[^>]*aria-label="Dune Tee, video ad"[^>]*muted=""[^>]*src="https:\/\/fal.example\/tall.mp4"/u
    );
  });

  it("once staged, shows the ad copy and the budget set", () => {
    const html = render([staged], META);
    expect(html).toContain("Wear the desert at dusk");
    expect(html).toContain("$15.00 a day");
  });
});

const runOf = (patch: Partial<RunDetail>) =>
  ({
    campaigns: [],
    designs: [],
    ideas: [],
    products: [],
    status: "completed",
    step: "publish",
    ...patch,
  }) as unknown as RunDetail;

describe("where a completed drop resumes", () => {
  it("at its products until they are live, then at the campaign", () => {
    const hidden = { ...live, status: "hidden" } as unknown as Product;
    expect(resumeStep(runOf({ products: [hidden] }))).toBe("products");
    expect(resumeStep(runOf({ products: [live] }))).toBe("campaign");
  });

  it("at done once launched, or with nothing to advertise", () => {
    expect(resumeStep(runOf({ campaigns: [staged], products: [live] }))).toBe(
      "done"
    );
    expect(resumeStep(runOf({}))).toBe("done");
  });

  it("keeps the drop page's campaign section waiting until it exists", () => {
    const run = { status: "completed" as const, step: "publish" };
    expect(
      sectionState("campaign", { ...run, campaigns: [], products: [live] })
    ).toBe("waiting");
    expect(
      sectionState("campaign", { ...run, campaigns: [staged], products: [] })
    ).toBe("done");
    expect(sectionState("products", { ...run, campaigns: [] })).toBe("done");
  });
});
