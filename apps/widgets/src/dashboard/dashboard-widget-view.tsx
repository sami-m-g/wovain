import { Button } from "@openai/apps-sdk-ui/components/Button";
import type { Dashboard } from "@wovain/shared/dashboard";
import { money } from "@wovain/shared/economics";
import { useId } from "react";

import { useAction } from "../lib/use-action.ts";
import { ActionError } from "../lib/widget-shell.tsx";
import { moneyText, ratioText } from "./format.ts";
import { SalesChart } from "./sales-chart.tsx";
import {
  AdTable,
  OptimizerList,
  ProductList,
  ReconciliationLine,
  RunList,
  Section,
  Table,
} from "./sections.tsx";

export type ConnectProvider = "fourthwall" | "meta";

interface DashboardWidgetActions {
  // Gets the merchant's personal connect link (connect_account) and opens it.
  onConnect: (provider: ConnectProvider) => Promise<void>;
}

export interface DashboardWidgetViewProps extends DashboardWidgetActions {
  dashboard: Dashboard;
}

const titles = { fal: "fal", fourthwall: "Fourthwall", meta: "Meta" };
const stateText = {
  connected: "connected",
  error: "couldn’t be read",
  missing: "not connected",
  unavailable: "not available yet",
};
const connectWhy = {
  fourthwall: "to see sales, orders and profit.",
  meta: "to see ad spend, ROAS and cost per sale.",
};

// Shop first: cost per sale on Fourthwall's orders from Meta links when there
// are any, else on the purchases Meta reports.
const costPerSale = ({ ads, reconciliation }: Dashboard) => {
  const shopOrders = reconciliation?.shopOrders ?? 0;
  return ads !== undefined && shopOrders > 0
    ? ads.totals.spend / shopOrders
    : ads?.totals.cpa;
};

const coachLine = (dashboard: Dashboard, days: string) => {
  const { ads, breakevenPerSale, sales } = dashboard;
  const cost = costPerSale(dashboard);
  if (cost !== undefined && breakevenPerSale !== undefined) {
    return cost <= breakevenPerSale
      ? `Each sale from ads costs ${money(cost)}, under your ${money(breakevenPerSale)} breakeven: the ads pay for themselves.`
      : `Each sale from ads costs ${money(cost)}, above your ${money(breakevenPerSale)} breakeven: the ads lose money on each sale.`;
  }
  if (sales !== undefined) {
    return `${money(sales.totals.revenue)} from ${String(sales.totals.orders)} orders in the last ${days}.`;
  }
  if (ads !== undefined) {
    return `${money(ads.totals.spend)} spent on Meta ads in the last ${days}.`;
  }
  return `No sales or ad results yet in the last ${days}.`;
};

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-secondary text-xs">{label}</dt>
    <dd className="m-0 truncate text-base font-medium">{value}</dd>
  </div>
);

export const DashboardWidgetView = ({
  dashboard,
  onConnect,
}: DashboardWidgetViewProps) => {
  const titleId = useId();
  const { busy, failed, pending, run } = useAction<ConnectProvider>();
  const { ads, connections, optimizer, products, reconciliation, runs, sales } =
    dashboard;
  const days = dashboard.range.replace("d", " days");
  const toConnect = connections.filter(
    (
      connection
    ): connection is typeof connection & {
      provider: ConnectProvider;
    } => connection.provider !== "fal" && connection.state !== "connected"
  );

  return (
    <article aria-labelledby={titleId} className="p-4">
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="heading-sm" id={titleId}>
          Your shop at a glance
        </h2>
        <span className="text-secondary ml-auto text-xs">{`Last ${days}`}</span>
      </header>
      <p className="text-secondary m-0 mt-1 text-sm">
        {coachLine(dashboard, days)}
      </p>

      {toConnect.map(({ provider, state }) => (
        <div
          className="border-default mt-3 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
          key={provider}
        >
          <p className="m-0 min-w-0 flex-1">
            {state === "missing"
              ? `Connect ${titles[provider]} ${connectWhy[provider]}`
              : `${titles[provider]} ${stateText[state]} just now. Ask again in a minute.`}
          </p>
          {state === "missing" ? (
            <Button
              className="wovain-accent"
              color="primary"
              disabled={pending}
              loading={busy === provider}
              onClick={() => {
                void run(provider, async () => {
                  await onConnect(provider);
                });
              }}
              size="sm"
            >
              {`Connect ${titles[provider]}`}
            </Button>
          ) : null}
        </div>
      ))}
      <ActionError failed={failed} />

      <dl className="m-0 mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Breakeven per sale"
          value={moneyText(dashboard.breakevenPerSale)}
        />
        {ads === undefined ? null : (
          <>
            <Kpi
              label="Cost per sale"
              value={moneyText(costPerSale(dashboard))}
            />
            <Kpi label="Ad spend" value={money(ads.totals.spend)} />
            <Kpi label="ROAS (Meta)" value={ratioText(ads.totals.roas)} />
          </>
        )}
        {sales === undefined ? null : (
          <>
            <Kpi label="Revenue" value={money(sales.totals.revenue)} />
            <Kpi label="Profit" value={money(sales.totals.profit)} />
            <Kpi label="Orders" value={String(sales.totals.orders)} />
            <Kpi label="Avg order" value={moneyText(sales.totals.aov)} />
          </>
        )}
      </dl>

      {sales === undefined ? null : (
        <Section title="Fourthwall sales">
          {sales.series.length > 0 ? (
            <SalesChart series={sales.series} />
          ) : null}
          {sales.topProducts.length > 0 ? (
            <Table
              caption="Top products"
              head={["Product", "Units", "Revenue"]}
              rows={sales.topProducts.map((product) => ({
                cells: [
                  product.name,
                  String(product.units),
                  money(product.revenue),
                ],
                key: product.name,
              }))}
            />
          ) : null}
          {sales.utm.length > 0 ? (
            <Table
              caption="Sales by UTM"
              head={["Source · ad", "Orders", "Revenue"]}
              rows={sales.utm.map((row) => ({
                cells: [
                  [row.source, row.ad ?? row.content]
                    .filter(Boolean)
                    .join(" · "),
                  String(row.orders),
                  money(row.revenue),
                ],
                key: `${row.source}-${row.content ?? ""}`,
              }))}
            />
          ) : null}
        </Section>
      )}

      {ads === undefined ? null : (
        <Section title="Meta ads">
          <p className="text-secondary m-0 mt-1 text-xs">
            {`${money(ads.totals.spend)} spent · ${String(ads.totals.purchases)} purchases reported by Meta · CPA ${moneyText(ads.totals.cpa)}`}
          </p>
          <AdTable caption="By campaign" rows={ads.campaigns} />
          {ads.concepts.length > 0 ? (
            <AdTable caption="By concept" rows={ads.concepts} />
          ) : null}
          <AdTable caption="By ad" rows={ads.ads} />
        </Section>
      )}

      {reconciliation === undefined ? null : (
        <ReconciliationLine reconciliation={reconciliation} />
      )}
      {products.length > 0 ? <ProductList products={products} /> : null}
      {runs.length > 0 ? <RunList runs={runs} /> : null}
      {optimizer === undefined ? null : <OptimizerList actions={optimizer} />}

      <p className="text-secondary border-subtle m-0 mt-4 border-t pt-3 text-xs">
        {connections
          .map(
            ({ provider, state }) => `${titles[provider]} ${stateText[state]}`
          )
          .join(" · ")}
      </p>
    </article>
  );
};
