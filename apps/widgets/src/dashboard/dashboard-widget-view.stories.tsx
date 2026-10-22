import type { Dashboard } from "@wovain/shared/dashboard";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { DashboardWidgetView } from "./dashboard-widget-view.tsx";

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

// The demo shop four weeks after launch: the sunset cat drop live, a second
// drop hidden by autopilot, two concepts on Meta.
const full: Dashboard = {
  ads: {
    ads: [
      {
        cpa: 7.5,
        id: "777",
        name: "wovain d1 · c1",
        purchaseValue: 240,
        purchases: 8,
        roas: 4,
        spend: 60,
      },
      {
        cpa: 15,
        id: "778",
        name: "wovain d1 · c2",
        purchaseValue: 90,
        purchases: 3,
        roas: 2,
        spend: 45,
      },
    ],
    campaigns: [
      {
        cpa: 9.55,
        id: "555",
        name: "wovain · 2026-09-24",
        purchaseValue: 330,
        purchases: 11,
        roas: 3.14,
        spend: 105,
      },
    ],
    concepts: [
      {
        cpa: 7.5,
        id: "d1 · c1",
        name: "d1 · c1",
        purchaseValue: 240,
        purchases: 8,
        roas: 4,
        spend: 60,
      },
      {
        cpa: 15,
        id: "d1 · c2",
        name: "d1 · c2",
        purchaseValue: 90,
        purchases: 3,
        roas: 2,
        spend: 45,
      },
    ],
    totals: {
      cpa: 9.55,
      purchaseValue: 330,
      purchases: 11,
      roas: 3.14,
      spend: 105,
    },
  },
  breakevenPerSale: 10.32,
  connections: [
    { provider: "fourthwall", state: "connected" },
    { provider: "fal", state: "connected" },
    { provider: "meta", state: "connected" },
  ],
  costPerSale: 10.5,
  generatedAt: "2026-10-22T09:00:00.000Z",
  optimizer: [
    {
      reason: "Under breakeven with 8 sales; budget is capped.",
      status: "proposed",
      target: "campaign 555",
      type: "budget_up",
    },
  ],
  products: [
    { designId: "d2", status: "hidden", title: "Retro Ramen Cat Drop" },
    {
      designId: "d1",
      status: "live",
      title: "Sunset Cat Drop",
      url: "https://catclub.fourthwall.com/collections/sunset-cat-drop",
    },
  ],
  range: "28d",
  reconciliation: { metaPurchases: 11, shopOrders: 10, status: "pass" },
  runs: [
    {
      createdAt: "2026-10-20T08:00:00.000Z",
      decisions: [
        {
          choice: "approve",
          point: "ads",
          reason: "Two distinct hooks, both on the live mockup.",
          subject: "d2",
        },
      ],
      id: "run-ramen",
      idea: "a tee for ramen-loving cat owners",
      spentUsd: 2.4,
      status: "done",
    },
  ],
  sales: {
    series: [3, 5, 4, 6, 2, 8, 7, 9, 5, 6, 10, 12, 8, 9].map((orders, i) => ({
      date: day(i + 1),
      orders,
      profit: orders * 9.5,
      revenue: orders * 30,
    })),
    topProducts: [
      { name: "Japanese Cat Sunset Tee", revenue: 1680, units: 56 },
      { name: "Japanese Cat Sunset Mug", revenue: 360, units: 18 },
      { name: "Japanese Cat Sunset Poster", revenue: 240, units: 10 },
    ],
    totals: { aov: 30, orders: 94, profit: 893, revenue: 2820 },
    utm: [
      {
        ad: "wovain d1 · c1",
        content: "777",
        orders: 7,
        revenue: 210,
        source: "facebook",
      },
      {
        ad: "wovain d1 · c2",
        content: "778",
        orders: 3,
        revenue: 90,
        source: "facebook",
      },
      { orders: 4, revenue: 120, source: "instagram" },
    ],
  },
};

const meta = preview.meta({
  args: {
    dashboard: full,
    onConnect: fn(async () => {
      await Promise.resolve();
    }),
  },
  component: DashboardWidgetView,
  title: "Widgets/Dashboard",
});

export const FullData = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/Each sale from ads costs \$10\.50, above/u)
    ).toBeVisible();
    await expect(canvas.getByText("$2820.00")).toBeVisible();
    await expect(canvas.getByText("facebook · wovain d1 · c1")).toBeVisible();
    await expect(canvas.getByText("Sources agree")).toBeVisible();
    await expect(canvas.getByText("Hidden")).toBeVisible();
    await expect(canvas.getByText("Recommended")).toBeVisible();
    await expect(canvas.queryAllByRole("button")).toHaveLength(0);
  },
});

export const FullDataDark = meta.story({ globals: { theme: "dark" } });

// Fourthwall connected, Meta not: one Connect card, the shop's numbers only.
const {
  ads: _ads,
  costPerSale: _costPerSale,
  optimizer: _optimizer,
  reconciliation: _reconciliation,
  ...shopOnly
} = full;
const partial: Dashboard = {
  ...shopOnly,
  connections: [
    { provider: "fourthwall", state: "connected" },
    { provider: "fal", state: "unavailable" },
    { provider: "meta", state: "missing" },
  ],
};

export const PartialConnections = meta.story({
  args: { dashboard: partial },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("$2820.00 from 94 orders", { exact: false })
    ).toBeVisible();
    const button = canvas.getByRole("button", { name: "Connect Meta" });
    await userEvent.click(button);
    await expect(args.onConnect).toHaveBeenCalledWith("meta");
    await expect(canvas.getAllByRole("button")).toHaveLength(1);
  },
});

export const PartialConnectionsDark = meta.story({
  args: { dashboard: partial },
  globals: { theme: "dark" },
});

// Everything connected, nothing sold or spent yet.
const empty: Dashboard = {
  connections: full.connections,
  generatedAt: full.generatedAt,
  products: [],
  range: "7d",
  runs: [],
};

export const Empty = meta.story({
  args: { dashboard: empty },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("No sales or ad results yet in the last 7 days.")
    ).toBeVisible();
  },
});

export const EmptyDark = meta.story({
  args: { dashboard: empty },
  globals: { theme: "dark" },
});

// Nothing connected: at most two Connect buttons (fal has none).
export const NothingConnected = meta.story({
  args: {
    dashboard: {
      ...empty,
      connections: [
        { provider: "fourthwall", state: "missing" },
        { provider: "fal", state: "missing" },
        { provider: "meta", state: "missing" },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button")).toHaveLength(2);
  },
});

export const ConnectFails = meta.story({
  args: {
    dashboard: partial,
    onConnect: fn(async () => {
      await Promise.reject(new Error("connect failed"));
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Connect Meta" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "That didn’t go through"
    );
  },
});

// Before the host hands the widget its tool result.
export const Loading = meta.story({
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Reading your shop and ads…")
    ).toBeVisible();
  },
  render: () => (
    <WidgetShell
      loading="Reading your shop and ads…"
      name="dashboard"
      widget={{ state: "loading" }}
    >
      {() => <span />}
    </WidgetShell>
  ),
});

export const LoadingDark = meta.story({
  globals: { theme: "dark" },
  render: Loading.input.render,
});
