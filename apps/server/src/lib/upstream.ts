import { setTimeout as delay } from "node:timers/promises";

import {
  auth,
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { CallToolResult, FetchLike } from "@modelcontextprotocol/client";

import { providers } from "./connections.ts";
import type { Connections, Grant, ProviderId } from "./connections.ts";
import { FirestoreOAuthProvider } from "./oauth-client.ts";

// The merchant hasn't connected the provider, or has to connect it again.
export interface NeedsConnection {
  connectUrl: string;
  needsConnection: ProviderId;
  reconnect: boolean;
}

export type UpstreamOutcome =
  | { connect: NeedsConnection; kind: "connect" }
  | { kind: "result"; result: CallToolResult };

interface Deps {
  connections: Connections;
  fetch?: FetchLike;
  now?: () => number;
  site: string;
  sleep?: (ms: number) => Promise<unknown>;
}

// One upstream tool call for one merchant.
export interface UpstreamRequest {
  args: Record<string, unknown>;
  id: ProviderId;
  tool: string;
  userId: string;
}

// A grant expiring within a minute is refreshed before the call; an instance
// that finds another one refreshing waits up to 10 s for the new grant.
const REFRESH_WITHIN_MS = 60 * 1000;
const WAIT_STEP_MS = 500;
const WAIT_STEPS = 20;

// Fourthwall answers a call without a valid grant with HTTP 200, isError and
// this _meta key instead of a 401.
const loginNeeded = (result: CallToolResult) =>
  result.isError === true &&
  result._meta !== undefined &&
  "mcp/www_authenticate" in result._meta;

// wovain as an MCP client of the merchant's Fourthwall and fal: every call
// uses that merchant's own OAuth grant, refreshed by the SDK.
export const createUpstream = ({
  connections,
  fetch = globalThis.fetch,
  now = Date.now,
  site,
  sleep = delay,
}: Deps) => {
  const authOptions = (id: ProviderId) => ({
    fetchFn: fetch,
    serverUrl: providers[id].serverUrl,
  });
  const provider = (userId: string, id: ProviderId, grant: Grant) =>
    new FirestoreOAuthProvider({
      connections,
      grant,
      provider: id,
      site,
      userId,
    });

  const connectUrl = async (userId: string, id: ProviderId) => {
    const ticket = await connections.createTicket(userId, id);
    return `${site}/connect/${id}?ticket=${ticket}`;
  };
  const needs = async (
    { id, userId }: UpstreamRequest,
    reconnect: boolean
  ): Promise<UpstreamOutcome> => ({
    connect: {
      connectUrl: await connectUrl(userId, id),
      needsConnection: id,
      reconnect,
    },
    kind: "connect",
  });

  const waitForNewer = async (
    request: UpstreamRequest,
    version: number,
    steps = WAIT_STEPS
  ): Promise<Grant | undefined> => {
    const latest = await connections.read(request.userId, request.id);
    if (latest?.record.version !== version || steps === 0) {
      return latest;
    }
    await sleep(WAIT_STEP_MS);
    return await waitForNewer(request, version, steps - 1);
  };

  // Refreshes a grant that's about to expire, one instance at a time: a
  // rotating refresh token can be spent only once.
  const fresh = async (request: UpstreamRequest, grant: Grant) => {
    const { id, userId } = request;
    const { expiresAt, version } = grant.record;
    const due =
      expiresAt !== undefined && expiresAt - now() < REFRESH_WITHIN_MS;
    if (!due || grant.tokens.refresh_token === undefined) {
      return grant;
    }
    const lease = await connections.acquireLease(userId, id, version);
    if (lease.status !== "held") {
      return await waitForNewer(request, version);
    }
    await auth(provider(userId, id, grant), authOptions(id));
    return await connections.read(userId, id);
  };

  const callOnce = async (
    oauth: FirestoreOAuthProvider,
    { args, id, tool }: UpstreamRequest
  ): Promise<CallToolResult> => {
    const client = new Client({ name: "wovain", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(providers[id].serverUrl),
      { authProvider: oauth, fetch }
    );
    await client.connect(transport);
    try {
      return await client.callTool({ arguments: args, name: tool });
    } finally {
      await client.close();
    }
  };

  // A refused grant gives the connect link; a grant another instance replaced
  // meanwhile is used for one retry.
  const attempt = async (
    request: UpstreamRequest,
    grant: Grant,
    retry: boolean
  ): Promise<UpstreamOutcome> => {
    const { id, userId } = request;
    const oauth = provider(userId, id, grant);
    const settled = await callOnce(oauth, request).then(
      (result) => ({ result }),
      (error: unknown) => ({ error })
    );
    if ("result" in settled) {
      if (!loginNeeded(settled.result)) {
        return { kind: "result", result: settled.result };
      }
      await connections.remove(userId, id, grant.record.version);
      return await needs(request, true);
    }
    if (!(settled.error instanceof UnauthorizedError)) {
      throw settled.error;
    }
    const latest = await connections.read(userId, id);
    if (
      latest !== undefined &&
      latest.record.version !== grant.record.version
    ) {
      return retry
        ? await attempt(request, latest, false)
        : await needs(request, true);
    }
    // A network failure during re-authentication is also an
    // UnauthorizedError; only the SDK giving up on the grant means reconnect.
    if (!oauth.invalidated && oauth.authorizationUrl === undefined) {
      throw settled.error;
    }
    await connections.remove(userId, id, grant.record.version);
    return await needs(request, true);
  };

  const call = async (request: UpstreamRequest): Promise<UpstreamOutcome> => {
    const stored = await connections.read(request.userId, request.id);
    const grant =
      stored === undefined ? undefined : await fresh(request, stored);
    return grant === undefined
      ? await needs(request, stored !== undefined)
      : await attempt(request, grant, true);
  };

  const authorize = async (userId: string, id: ProviderId) => {
    const state = await connections.createFlow(userId, id);
    const oauth = new FirestoreOAuthProvider({
      connections,
      flow: { state },
      provider: id,
      site,
      userId,
    });
    await auth(oauth, authOptions(id));
    return oauth.authorizationUrl;
  };

  // /connect/:provider: redeems the ticket and returns the provider's
  // consent page, or undefined for a bad ticket.
  const startConnect = async (ticket: string, id: ProviderId) => {
    const userId = await connections.redeemTicket(ticket, id);
    return userId === undefined ? undefined : await authorize(userId, id);
  };

  // /oauth/callback/:provider: exchanges the code for the flow in `state`.
  const finishConnect = async (
    id: ProviderId,
    { code, iss, state }: { code: string; iss?: string; state: string }
  ) => {
    const flow = await connections.takeFlow(state);
    if (flow?.provider !== id) {
      return false;
    }
    const oauth = new FirestoreOAuthProvider({
      callback: true,
      connections,
      flow: { ...flow, state },
      provider: id,
      site,
      userId: flow.userId,
    });
    const outcome = await auth(oauth, {
      ...authOptions(id),
      authorizationCode: code,
      ...(iss === undefined ? {} : { iss }),
    });
    return outcome === "AUTHORIZED";
  };

  return { call, connectUrl, finishConnect, startConnect };
};

export type Upstream = ReturnType<typeof createUpstream>;

// The tool reply for a missing or refused grant: a link the merchant opens
// in a browser, in any host (widgets or not).
export const connectReply = ({
  connectUrl,
  needsConnection,
  reconnect,
}: NeedsConnection) => {
  const { title } = providers[needsConnection];
  const why = reconnect
    ? `wovain's access to the merchant's ${title} account expired or was revoked.`
    : `The merchant hasn't connected ${title} to wovain yet.`;
  return {
    content: [
      {
        text: `${why} Show the merchant this link to connect their ${title} account (it works once, for 10 minutes): ${connectUrl}\nThen wait until they say it's done and retry.`,
        type: "text" as const,
      },
    ],
    structuredContent: { connectUrl, needsConnection, reconnect },
  };
};
