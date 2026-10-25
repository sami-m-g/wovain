import { ORPCError } from "@orpc/client";
import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@wovain/api/routers/index";

import { client } from "@/utils/orpc";

/**
 * The seller flow's client interface. Every screen talks to `flowClient` and
 * nothing else; it calls the oRPC procedures in `@wovain/api` (types come
 * straight from `AppRouter`, so a backend change surfaces here at compile time).
 */

type Outputs = InferRouterOutputs<AppRouter>;

export type Provider = Outputs["connections"]["list"][number]["provider"];
export type Connection = Outputs["connections"]["list"][number];
export type Run = Outputs["runs"]["list"][number];
export type RunDetail = Outputs["runs"]["get"];
export type Idea = RunDetail["ideas"][number];
export type Design = Outputs["designs"]["get"];
export type Product = Outputs["products"]["create"];
export type Campaign = Outputs["campaigns"]["create"];

export const PROVIDERS = [
  "fourthwall",
  "meta",
] as const satisfies readonly Provider[];

export interface FlowClient {
  connections: {
    list: () => Promise<Connection[]>;
    disconnect: (provider: Provider) => Promise<{ disconnected: boolean }>;
  };
  runs: {
    list: () => Promise<Run[]>;
    get: (id: string) => Promise<RunDetail>;
    start: (input: {
      seed: string;
      autopilot: boolean;
      dailyBudget: number;
    }) => Promise<RunDetail>;
  };
  designs: {
    generate: (ideaId: string) => Promise<Design>;
    approve: (id: string) => Promise<Design>;
    reject: (id: string, reason?: string) => Promise<Design>;
  };
  products: {
    create: (designId: string) => Promise<Product>;
    publish: (id: string) => Promise<Product>;
  };
  campaigns: {
    create: (input: {
      productId: string;
      dailyBudget: number;
    }) => Promise<Campaign>;
  };
}

export const flowClient: FlowClient = {
  campaigns: {
    create: ({ productId, dailyBudget }) =>
      client.campaigns.create({ dailyBudget, productId }),
  },
  connections: {
    disconnect: (provider) => client.connections.disconnect({ provider }),
    list: () => client.connections.list(),
  },
  designs: {
    approve: (id) => client.designs.approve({ id }),
    generate: (ideaId) => client.designs.generate({ ideaId }),
    reject: (id, reason) =>
      client.designs.reject(reason ? { id, reason } : { id }),
  },
  products: {
    create: (designId) => client.products.create({ designId }),
    publish: (id) => client.products.publish({ id }),
  },
  runs: {
    get: (id) => client.runs.get({ id }),
    list: () => client.runs.list(),
    start: ({ seed, autopilot, dailyBudget }) =>
      client.runs.start({ autopilot, dailyBudget, seed }),
  },
};

/**
 * The browser URL that starts connecting a provider; the server redirects to
 * the provider's consent page and back to `returnTo` with `?connected=`.
 */
export const connectUrl = (provider: Provider, returnTo: string) =>
  `/api/connections/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;

export type FlowProblem =
  | { kind: "not_configured"; service: string; variable?: string }
  | { kind: "not_connected"; service: string }
  | { kind: "other"; message: string };

const VARIABLE = /\b(?<name>[A-Z][A-Z0-9_]{2,})\b/u;
const SERVICE_CODE =
  /^(?<service>[A-Z]+)_(?<kind>NOT_CONFIGURED|NOT_CONNECTED)$/u;

/** Turns a procedure error into something a step can explain to the seller. */
export const describeProblem = (error: unknown): FlowProblem => {
  if (error instanceof ORPCError) {
    const match = SERVICE_CODE.exec(String(error.code));
    if (match?.groups) {
      const service = match.groups.service?.toLowerCase() ?? "";
      if (match.groups.kind === "NOT_CONNECTED") {
        return { kind: "not_connected", service };
      }
      const data = (error.data ?? {}) as { why?: unknown; fix?: unknown };
      const variable = VARIABLE.exec(String(data.why ?? data.fix ?? ""))?.groups
        ?.name;
      return variable
        ? { kind: "not_configured", service, variable }
        : { kind: "not_configured", service };
    }
    return { kind: "other", message: error.message };
  }
  return {
    kind: "other",
    message: error instanceof Error ? error.message : String(error),
  };
};
