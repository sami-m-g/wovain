import {
  dashboardSchema,
  isConnectPrompt,
  rangeDays,
} from "@wovain/shared/dashboard";
import type {
  Dashboard,
  DashboardConnection,
  DashboardRange,
} from "@wovain/shared/dashboard";

import type { Store } from "../store.ts";
import type { ProviderId } from "./connections.ts";
import {
  adsFrom,
  breakevenOf,
  costPerSaleOf,
  metaOrdersFrom,
  metaAds,
  productsFrom,
  reconcile,
  runsFrom,
  salesFrom,
} from "./dashboard-sections.ts";
import { newConversationId } from "./meta-draft.ts";
import { str } from "./report-rows.ts";
import type { Row } from "./report-rows.ts";
import { readRows } from "./upstream-rows.ts";
import type { Read } from "./upstream-rows.ts";
import { canReach } from "./upstream.ts";
import type { Upstream } from "./upstream.ts";

// The merchant dashboard's data (docs/changes/31-merchant-dashboard): three
// Fourthwall reports and one Meta read on the merchant's own grants, plus
// wovain's records, all at once. A source that fails or isn't connected only
// empties its own section. Nothing from a reply is logged.

const DAY = 86_400_000;

type State = DashboardConnection["state"];

const stateOf = (reads: Read[]): State => {
  if (reads.some((read) => read.kind === "missing")) {
    return "missing";
  }
  return reads.every((read) => read.kind === "error") ? "error" : "connected";
};

const rowsOf = (read: Read | undefined) =>
  read?.kind === "rows" ? read.rows : [];

interface Gather {
  now?: () => number;
  range: DashboardRange;
  store: Store;
  upstream: Upstream | undefined;
}

// Reads one merchant's sources; every call names their own userId.
const sourcesFor = ({ now = Date.now, range, store, upstream }: Gather) => {
  const { userId } = store;
  const at = now();
  const read = async (
    id: ProviderId,
    tool: string,
    args: Record<string, unknown>
  ): Promise<Read> =>
    // A failed read empties its section; the reason isn't kept.
    await readRows(upstream, { args, id, tool, userId });
  const connected = async (id: ProviderId): Promise<State> => {
    if (!canReach(upstream, id)) {
      return "unavailable";
    }
    return (await upstream.connected(userId, id)) ? "connected" : "missing";
  };

  const fourthwall = async () => {
    const state = await connected("fourthwall");
    if (state !== "connected") {
      return { overTime: [], state, top: [], utm: [] };
    }
    const window = {
      from: new Date(at - rangeDays[range] * DAY).toISOString(),
      to: new Date(at).toISOString(),
    };
    const precision = range === "90d" ? "WEEK" : "DAY";
    const [overTime, top, utm] = await Promise.all([
      read("fourthwall", "ecommerce_get-sales-over-time-report", {
        ...window,
        aggregationPrecision: precision,
      }),
      read(
        "fourthwall",
        "ecommerce_get-top-products-by-units-sold-report",
        window
      ),
      read("fourthwall", "ecommerce_get-sales-by-utm-report", {
        ...window,
        aggregationPrecision: precision,
      }),
    ]);
    return {
      overTime: rowsOf(overTime),
      state: stateOf([overTime, top, utm]),
      top: rowsOf(top),
      utm: rowsOf(utm),
    };
  };

  // Ad-level results on wovain's campaign's ad account, else the merchant's
  // first one.
  const meta = async (): Promise<{ rows: Row[]; state: State }> => {
    const [state, campaign] = await Promise.all([
      connected("meta"),
      store.getCampaign(),
    ]);
    if (state !== "connected") {
      return { rows: [], state };
    }
    const base = {
      advertiser_job: "report_measure_or_look_up",
      client_conversation_id: newConversationId(),
    };
    const accounts =
      campaign === undefined
        ? await read("meta", "ads_get_ad_accounts", base)
        : undefined;
    if (accounts !== undefined && accounts.kind !== "rows") {
      return { rows: [], state: stateOf([accounts]) };
    }
    const [first] = rowsOf(accounts);
    const account = (
      campaign?.adAccountId ??
      (first === undefined ? undefined : str(first, "account_id", "id"))
    )?.replace(/^act_/u, "");
    if (account === undefined) {
      return { rows: [], state };
    }
    const entities = await read("meta", "ads_get_ad_entities", {
      ...base,
      ad_account_id: account,
      date_preset: `last_${range}`,
      fields: [
        "id",
        "name",
        "campaign_id",
        "campaign_name",
        "amount_spent",
        "omni_purchase",
        "omni_purchase_values",
      ],
      level: "ad",
      limit: 200,
    });
    return { rows: rowsOf(entities), state: stateOf([entities]) };
  };

  return { at, connected, fourthwall, meta };
};

export const gatherDashboard = async (gather: Gather): Promise<Dashboard> => {
  const { range, store } = gather;
  const { at, connected, fourthwall, meta } = sourcesFor(gather);

  const [shop, metaRead, fal, designs, runs] = await Promise.all([
    fourthwall(),
    meta(),
    connected("fal"),
    store.getDesigns(),
    store.getAutopilotRuns(),
  ]);

  const adRows = metaAds(metaRead.rows);
  const ads = adsFrom(adRows);
  const sales = salesFrom(shop, new Map(adRows.map((ad) => [ad.id, ad.name])));
  const reconciliation = reconcile(
    sales === undefined ? undefined : metaOrdersFrom(shop.utm),
    ads
  );
  const breakevenPerSale = breakevenOf(designs);
  const costPerSale = costPerSaleOf(ads, reconciliation);

  return dashboardSchema.parse({
    connections: [
      { provider: "fourthwall", state: shop.state },
      { provider: "fal", state: fal },
      { provider: "meta", state: metaRead.state },
    ],
    generatedAt: new Date(at).toISOString(),
    products: productsFrom(designs),
    range,
    runs: runsFrom(runs),
    ...(ads === undefined ? {} : { ads }),
    ...(breakevenPerSale === undefined ? {} : { breakevenPerSale }),
    ...(costPerSale === undefined ? {} : { costPerSale }),
    ...(reconciliation === undefined ? {} : { reconciliation }),
    ...(sales === undefined ? {} : { sales }),
  });
};

// One minute per merchant and range, in this process. The key is the signed-in
// merchant's id, so one merchant's numbers never answer another's request.
// Concurrent calls share one gather. A failed gather isn't kept, nor one
// where Fourthwall or Meta is missing or failed: the merchant may be
// connecting it right now.
export const createDashboardCache = ({
  max = 200,
  now = Date.now,
  ttlMs = 60_000,
}: { max?: number; now?: () => number; ttlMs?: number } = {}) => {
  const entries = new Map<string, { at: number; value: Promise<Dashboard> }>();
  return async (
    userId: string,
    range: DashboardRange,
    load: () => Promise<Dashboard>
  ) => {
    const key = JSON.stringify([userId, range]);
    const hit = entries.get(key);
    if (hit !== undefined && now() - hit.at < ttlMs) {
      return await hit.value;
    }
    const entry = { at: now(), value: load() };
    entries.delete(key);
    entries.set(key, entry);
    // Insertion order is age order: drop expired entries, then the oldest
    // past the cap.
    for (const [oldKey, old] of entries) {
      if (entries.size <= max && now() - old.at < ttlMs) {
        break;
      }
      entries.delete(oldKey);
    }
    const drop = () => {
      if (entries.get(key) === entry) {
        entries.delete(key);
      }
    };
    try {
      const dashboard = await entry.value;
      if (
        dashboard.connections.some(
          ({ provider, state }) =>
            isConnectPrompt(provider) && state !== "connected"
        )
      ) {
        drop();
      }
      return dashboard;
    } catch (error) {
      if (entries.get(key) === entry) {
        entries.delete(key);
      }
      throw error;
    }
  };
};
export type DashboardCache = ReturnType<typeof createDashboardCache>;
