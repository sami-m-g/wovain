import { randomBytes } from "node:crypto";

import { ORPCError } from "@orpc/server";
import type { GrantStore, ProviderId, ToolCall } from "@wovain/core/upstream";
import { connection, connectionFlow } from "@wovain/db/schema/seller";
import { and, eq, gt, lte } from "drizzle-orm";
import { defineError } from "evlog";
import { z } from "zod";

import type { Actor } from "./actor";

// The merchant's connections: Fourthwall and Meta grants sealed in the
// database with the authorization flows that create them, and the
// merchant's own fal key.

const FLOW_TTL_MS = 10 * 60 * 1000;

const FlowInvalid = defineError("CONNECTION_FLOW_INVALID", {
  fix: "Start connecting again from wovain.",
  message: "This connection link expired or was already used",
  status: 400,
});

// What the MCP SDK saves, checked after unsealing.
const tokensSchema = z.looseObject({
  access_token: z.string(),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  issuer: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string(),
});

const grantStore = (
  { core, db, userId }: Actor,
  provider: ProviderId
): GrantStore => {
  // Binds each ciphertext to its owner and provider.
  const context = `${userId}:${provider}`;
  const mine = and(
    eq(connection.userId, userId),
    eq(connection.provider, provider)
  );
  return {
    clear: async () => {
      await db.delete(connection).where(mine);
    },
    load: async () => {
      const [row] = await db
        .select({ sealedTokens: connection.sealedTokens })
        .from(connection)
        .where(mine);
      return row === undefined
        ? undefined
        : tokensSchema.parse(
            JSON.parse(core.sealer.open(row.sealedTokens, context))
          );
    },
    save: async (tokens) => {
      const sealedTokens = core.sealer.seal(JSON.stringify(tokens), context);
      await db
        .insert(connection)
        .values({ provider, sealedTokens, userId })
        .onConflictDoUpdate({
          set: { sealedTokens },
          target: [connection.userId, connection.provider],
        });
    },
  };
};

// Runs Fourthwall or Meta tool calls on the merchant's own account.
export const withProvider = async <T>(
  actor: Actor,
  provider: ProviderId,
  work: (call: ToolCall) => Promise<T>
) =>
  await actor.core.upstream.session(
    provider,
    grantStore(actor, provider),
    actor.log,
    work
  );

// fal draws on the merchant's own fal account (its MCP relay, their OAuth
// grant), never on a wovain key: a step that draws checks for the grant
// first and answers this typed error, before any model call.
export const connectionErrors = {
  FAL_NOT_CONNECTED: {
    data: z.object({ provider: z.literal("fal") }),
    message: "Connect your fal account to draw designs",
    status: 409,
  },
} as const;

const falNotConnected = () =>
  new ORPCError("FAL_NOT_CONNECTED", {
    data: { provider: "fal" },
    message: connectionErrors.FAL_NOT_CONNECTED.message,
    status: connectionErrors.FAL_NOT_CONNECTED.status,
  });

export const requireFal = async ({ db, userId }: Actor) => {
  const [row] = await db
    .select({ id: connection.id })
    .from(connection)
    .where(and(eq(connection.userId, userId), eq(connection.provider, "fal")));
  if (row === undefined) {
    throw falNotConnected();
  }
};

export const listConnections = async ({ db, userId }: Actor) =>
  await db
    .select({
      connectedAt: connection.connectedAt,
      provider: connection.provider,
    })
    .from(connection)
    .where(eq(connection.userId, userId));

// The provider's consent page; the callback comes back to `returnTo`.
export const startConnection = async (
  actor: Actor,
  provider: ProviderId,
  returnTo: string
) => {
  const state = randomBytes(24).toString("base64url");
  const { authorizationUrl, flow } = await actor.core.upstream.startConnect(
    provider,
    grantStore(actor, provider),
    state,
    actor.log
  );
  // Flows nobody finished would pile up: each new one clears the expired.
  await actor.db
    .delete(connectionFlow)
    .where(lte(connectionFlow.expiresAt, new Date()));
  await actor.db.insert(connectionFlow).values({
    codeVerifier: flow.codeVerifier ?? null,
    discoveryState: flow.discoveryState ?? null,
    expiresAt: new Date(Date.now() + FLOW_TTL_MS),
    provider,
    returnTo,
    state,
    userId: actor.userId,
  });
  return { authorizationUrl };
};

// The provider's redirect back: only the merchant who started the flow can
// finish it, once, within its lifetime.
export const completeConnection = async (
  actor: Actor,
  {
    code,
    iss,
    provider,
    state,
  }: {
    code: string;
    iss?: string | undefined;
    provider: ProviderId;
    state: string;
  }
) => {
  const [flow] = await actor.db
    .delete(connectionFlow)
    .where(
      and(
        eq(connectionFlow.state, state),
        eq(connectionFlow.userId, actor.userId),
        eq(connectionFlow.provider, provider),
        gt(connectionFlow.expiresAt, new Date())
      )
    )
    .returning();
  if (flow === undefined) {
    throw FlowInvalid();
  }
  const connected = await actor.core.upstream.finishConnect(
    provider,
    grantStore(actor, provider),
    {
      code,
      flow: {
        state,
        ...(flow.codeVerifier === null
          ? {}
          : { codeVerifier: flow.codeVerifier }),
        ...(flow.discoveryState === null
          ? {}
          : { discoveryState: flow.discoveryState }),
      },
      ...(iss === undefined ? {} : { iss }),
    },
    actor.log
  );
  return { connected, returnTo: flow.returnTo };
};

export const disconnect = async (actor: Actor, provider: ProviderId) => {
  const removed = await actor.db
    .delete(connection)
    .where(
      and(
        eq(connection.userId, actor.userId),
        eq(connection.provider, provider)
      )
    )
    .returning({ id: connection.id });
  return { disconnected: removed.length > 0 };
};
