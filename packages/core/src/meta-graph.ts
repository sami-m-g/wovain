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

export interface Dataset {
  id: string;
  // ISO time Meta last received an event, or null if never.
  lastFiredAt: string | null;
  name: string | null;
}

const datasetsSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        last_fired_time: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .default([]),
});
const businessSchema = z.object({
  business: z.object({ id: z.string() }).optional(),
});
const idSchema = z.object({ id: z.string() });
const eventsSchema = z.object({ events_received: z.number() });

const MS_PER_SECOND = 1000;

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
  const request = async (
    log: Logger | undefined,
    operation: string,
    token: string,
    path: string,
    form?: URLSearchParams
  ): Promise<unknown> =>
    await external(log, { operation, provider: "meta" }, async () => {
      const response = await fetchFn(`${graphUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...(form === undefined ? {} : { body: form, method: "POST" }),
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
  const get = async (
    log: Logger | undefined,
    operation: string,
    token: string,
    path: string
  ) => await request(log, operation, token, path);
  const post = async (
    log: Logger | undefined,
    operation: string,
    token: string,
    path: string,
    body: Record<string, string>
  ) => await request(log, operation, token, path, new URLSearchParams(body));

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

  // The datasets (pixels) the ad account can use, with when each last
  // received an event.
  const datasets = async (
    token: string,
    adAccountId: string,
    log?: Logger
  ): Promise<Dataset[]> => {
    const { data } = datasetsSchema.parse(
      await get(
        log,
        "graph.adspixels",
        token,
        `/act_${adAccountId}/adspixels?fields=id,name,last_fired_time&limit=50`
      )
    );
    return data.map((row) => ({
      id: row.id,
      lastFiredAt: row.last_fired_time ?? null,
      name: row.name ?? null,
    }));
  };

  // The business that owns the ad account, if any (a personal ad account
  // has none).
  const businessOf = async (
    token: string,
    adAccountId: string,
    log?: Logger
  ): Promise<string | undefined> =>
    businessSchema.parse(
      await get(
        log,
        "graph.ad_account_business",
        token,
        `/act_${adAccountId}?fields=business`
      )
    ).business?.id;

  /**
   * Creates a dataset named `name`: under the ad account's business, then
   * shared with the ad account (the business owns both, so
   * shared_accounts works), or on the ad account itself when no business
   * owns it.
   * https://developers.facebook.com/docs/marketing-api/reference/business/adspixels/
   * https://developers.facebook.com/docs/marketing-api/reference/ad-account/adspixels/
   * https://developers.facebook.com/docs/marketing-api/reference/ads-pixel/shared_accounts/
   */
  const createDataset = async (
    token: string,
    adAccountId: string,
    name: string,
    log?: Logger
  ): Promise<{ businessId: string | undefined; id: string }> => {
    const businessId = await businessOf(token, adAccountId, log);
    if (businessId === undefined) {
      const { id } = idSchema.parse(
        await post(
          log,
          "graph.create_dataset",
          token,
          `/act_${adAccountId}/adspixels`,
          { name }
        )
      );
      return { businessId, id };
    }
    // A dataset made by an earlier set-up whose share failed is the
    // business's but not yet the ad account's: reuse it rather than make a
    // second one, and stop when the name isn't unique.
    const { data: owned } = datasetsSchema.parse(
      await get(
        log,
        "graph.business_adspixels",
        token,
        `/${businessId}/adspixels?fields=id,name&limit=200`
      )
    );
    const named = owned.filter((each) => each.name === name);
    if (named.length > 1) {
      throw new GraphRefusedError(
        `The business has ${named.length} datasets named "${name}"; keep one in Events Manager`,
        undefined
      );
    }
    const id =
      named[0]?.id ??
      idSchema.parse(
        await post(
          log,
          "graph.create_dataset",
          token,
          `/${businessId}/adspixels`,
          { name }
        )
      ).id;
    await post(log, "graph.share_dataset", token, `/${id}/shared_accounts`, {
      account_id: adAccountId,
      business: businessId,
    });
    return { businessId, id };
  };

  /**
   * Sends one PageView to the dataset as a Conversions API test event: it
   * shows in Events Manager > Test events under `testEventCode`, and Meta
   * neither counts it nor uses it for ads.
   * https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api#testEvents
   */
  const sendTestEvent = async (
    token: string,
    datasetId: string,
    {
      now = new Date(),
      sourceUrl,
      testEventCode,
    }: { now?: Date; sourceUrl: string; testEventCode: string },
    log?: Logger
  ): Promise<number> => {
    const reply = eventsSchema.parse(
      await post(log, "graph.test_event", token, `/${datasetId}/events`, {
        data: JSON.stringify([
          {
            action_source: "website",
            event_name: "PageView",
            event_source_url: sourceUrl,
            event_time: Math.floor(now.getTime() / MS_PER_SECOND),
            user_data: { client_user_agent: "wovain pixel setup" },
          },
        ]),
        test_event_code: testEventCode,
      })
    );
    return reply.events_received;
  };

  return { createDataset, datasets, readiness, sendTestEvent };
};

export type MetaGraph = ReturnType<typeof createMetaGraph>;
