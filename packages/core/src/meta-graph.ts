import { z } from "zod";

import { external } from "./log";
import type { Logger } from "./log";

// The Graph API with the merchant's own Meta grant: the same token the Ads
// MCP server takes. Meta's MCP authorization server (www.facebook.com/ads)
// issues it from Graph's own token endpoint
// (graph.facebook.com/<version>/oauth/access_token) for wovain's app, so it
// is a Facebook user access token. What the MCP tools can't do (automated
// rules, dataset set-up) goes through Graph with it. This module only reads
// whether that works: the permissions the merchant granted, and whether the
// ad account's automated rules can be read.
// https://developers.facebook.com/docs/graph-api/reference/user/permissions/
// https://developers.facebook.com/docs/marketing-api/ad-rules/overview

const TIMEOUT_MS = 10_000;

// What the safety rules (Meta's automated rules) and the pixel set-up need.
export const GRAPH_PERMISSIONS = [
  "ads_management",
  "business_management",
] as const;

const permissionsSchema = z.object({
  data: z
    .array(z.object({ permission: z.string(), status: z.string() }))
    .default([]),
});

const graphErrorSchema = z.object({
  error: z.object({ code: z.number().optional(), message: z.string() }),
});

// Graph answered that the token is no good (expired, revoked, or not a
// Graph token): the merchant must reconnect Meta.
const TOKEN_REFUSED = new Set([190, 102]);
const PERMISSION_DENIED = new Set([10, 200, 294]);

export type GraphReadiness =
  | { state: "ready"; granted: string[] }
  // The token works, but a permission is missing or the rules can't be
  // read: a reconnect asks for them again.
  | { state: "missing"; granted: string[]; missing: string[] }
  // Graph refused the token itself.
  | { state: "refused"; reason: string };

export class GraphRefusedError extends Error {
  readonly code: number | undefined;
  constructor(message: string, code: number | undefined) {
    super(message);
    this.name = "GraphRefusedError";
    this.code = code;
  }
}

// Graph's error code, on the error or on what it wraps (./log external).
const graphCode = (error: unknown): number | undefined => {
  if (error instanceof GraphRefusedError) {
    return error.code;
  }
  return error instanceof Error && error.cause !== undefined
    ? graphCode(error.cause)
    : undefined;
};

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export interface MetaGraphConfig {
  fetch?: typeof fetch;
  // The Graph API base with its version, e.g. https://graph.facebook.com/v26.0
  graphUrl: string;
}

export const createMetaGraph = ({
  fetch: fetchFn = fetch,
  graphUrl,
}: MetaGraphConfig) => {
  const get = async (
    log: Logger | undefined,
    operation: string,
    token: string,
    path: string
  ): Promise<unknown> =>
    await external(log, { operation, provider: "meta" }, async () => {
      const response = await fetchFn(`${graphUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body: unknown = await response.json();
      if (response.ok) {
        return body;
      }
      const failed = graphErrorSchema.safeParse(body);
      const code = failed.success ? failed.data.error.code : undefined;
      const message = failed.success
        ? failed.data.error.message
        : `Graph answered ${response.status}`;
      throw new GraphRefusedError(`Graph ${path}: ${message}`, code);
    });

  // Which permissions the merchant granted, and whether the account's
  // automated rules can be read with them.
  const readiness = async (
    token: string,
    adAccountId: string | undefined,
    log?: Logger
  ): Promise<GraphReadiness> => {
    let granted: string[];
    try {
      const { data } = permissionsSchema.parse(
        await get(log, "graph.permissions", token, "/me/permissions")
      );
      granted = data
        .filter((row) => row.status === "granted")
        .map((row) => row.permission);
    } catch (error) {
      if (TOKEN_REFUSED.has(graphCode(error) ?? 0)) {
        return { reason: reasonOf(error), state: "refused" };
      }
      throw error;
    }
    const missing = GRAPH_PERMISSIONS.filter(
      (permission) => !granted.includes(permission)
    );
    if (missing.length > 0) {
      return { granted, missing, state: "missing" };
    }
    if (adAccountId !== undefined) {
      try {
        await get(
          log,
          "graph.adrules_library",
          token,
          `/act_${adAccountId}/adrules_library?fields=id&limit=1`
        );
      } catch (error) {
        if (PERMISSION_DENIED.has(graphCode(error) ?? 0)) {
          return { granted, missing: ["ads_management"], state: "missing" };
        }
        throw error;
      }
    }
    return { granted, state: "ready" };
  };

  return { readiness };
};

export type MetaGraph = ReturnType<typeof createMetaGraph>;
