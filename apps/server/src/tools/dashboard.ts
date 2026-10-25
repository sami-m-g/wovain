import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  dashboardInputSchema,
  dashboardResultSchema,
  isConnectPrompt,
  rangeDays,
} from "@wovain/shared/dashboard";
import type { Dashboard } from "@wovain/shared/dashboard";
import { money } from "@wovain/shared/economics";

import { providers } from "../lib/connections.ts";
import { gatherDashboard } from "../lib/dashboard.ts";
import type { DashboardCache } from "../lib/dashboard.ts";
import { text } from "../lib/tool-result.ts";
import { UNTRUSTED } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

// What the agent reads: the headline numbers and which accounts to connect.
// Names from the merchant's accounts stay in structuredContent, marked as data.
const agreement = {
  fail: "disagree: trust Fourthwall's count",
  pass: "agree",
  unknown: "too few sales to compare",
};

const summary = (dashboard: Dashboard) => {
  const { ads, breakevenPerSale, connections, costPerSale, range } = dashboard;
  const { reconciliation, sales } = dashboard;
  const lines = [`wovain dashboard, last ${String(rangeDays[range])} days.`];
  if (sales !== undefined) {
    lines.push(
      `Fourthwall: ${money(sales.totals.revenue)} revenue, ${String(sales.totals.orders)} orders, ${money(sales.totals.profit)} profit.`
    );
  }
  if (ads !== undefined) {
    lines.push(
      `Meta: ${money(ads.totals.spend)} spent, ${String(ads.totals.purchases)} purchases reported.`
    );
  }
  if (costPerSale !== undefined && breakevenPerSale !== undefined) {
    lines.push(
      `Ad spend per sale ${money(costPerSale)} against a ${money(breakevenPerSale)} breakeven.`
    );
  }
  if (reconciliation !== undefined) {
    lines.push(
      `Orders from Meta links on Fourthwall: ${String(reconciliation.shopOrders)}; the sources ${agreement[reconciliation.status]}.`
    );
  }
  for (const { provider, state } of connections) {
    const { title } = providers[provider];
    if (state === "missing" && isConnectPrompt(provider)) {
      lines.push(`${title} isn't connected: offer connect_account.`);
    }
    if (state === "error") {
      lines.push(
        `${title} couldn't be read just now: say so, and don't read its missing numbers as zero.`
      );
    }
  }
  return [...lines, UNTRUSTED].join("\n");
};

export const registerDashboardTools = (
  server: McpServer,
  store: Store,
  { cache, upstream }: { cache: DashboardCache; upstream: Upstream | undefined }
) => {
  const handle = async ({ range }: { range: Dashboard["range"] }) => {
    const dashboard = await cache(
      store.userId,
      range,
      async () => await gatherDashboard({ range, store, upstream })
    );
    return {
      content: text(summary(dashboard)),
      structuredContent: { dashboard },
    };
  };
  const shared = {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    inputSchema: dashboardInputSchema,
    outputSchema: dashboardResultSchema,
  };

  registerAppTool(
    server,
    "dashboard_data",
    {
      ...shared,
      _meta: { ui: { visibility: ["model", "app"] } },
      description:
        "The merchant's dashboard numbers for the last 7, 28 or 90 days: Fourthwall sales (revenue, orders, profit, AOV, top products, sales by UTM mapped to ads), Meta results per campaign, ad and concept, the two sources compared, the products wovain created, recent autopilot runs and connection status. Read-only, on the merchant's own accounts; cached for a minute.",
      title: "Dashboard data",
    },
    handle
  );

  registerAppTool(
    server,
    "show_dashboard",
    {
      ...shared,
      _meta: { ui: { resourceUri: widgetUri("dashboard") } },
      description:
        "Show the wovain dashboard widget: how the merchant's products sell and whether their ads pay for themselves. Use when the merchant asks how their shop, products or ads are doing.",
      title: "Show the wovain dashboard",
    },
    handle
  );
};
