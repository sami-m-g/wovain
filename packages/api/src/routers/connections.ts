import {
  connectorIds,
  keyProviderIds,
  providerIds,
} from "@wovain/core/upstream";
import { z } from "zod";

import {
  completeConnection,
  disconnect,
  listConnections,
  saveApiKey,
  startConnection,
} from "../flow/connections";
import { protectedProcedure } from "../index";

const provider = z.enum(providerIds);
const connector = z.enum(connectorIds);
// A path on this site to come back to, never another origin: browsers read
// "//host" and "/\host" as another host, so no second slash or backslash.
const returnTo = z
  .string()
  .regex(/^\/(?![/\\])[^\s\\]*$/u)
  .max(512)
  .default("/dashboard");

export const connectionsRouter = {
  complete: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(2048),
        iss: z.string().max(2048).optional(),
        provider,
        state: z.string().min(1).max(256),
      })
    )
    .handler(async ({ context, input }) => {
      const result = await completeConnection(context, input);
      // A funnel step, once the provider's consent actually connected.
      if (result.connected) {
        await context.analytics?.capture({
          distinctId: context.userId,
          event: "connect_provider",
          properties: { provider: input.provider },
        });
      }
      return result;
    }),
  connect: protectedProcedure
    .input(z.object({ provider, returnTo }))
    .handler(
      async ({ context, input }) =>
        await startConnection(context, input.provider, input.returnTo)
    ),
  disconnect: protectedProcedure
    .input(z.object({ provider: connector }))
    .handler(
      async ({ context, input }) => await disconnect(context, input.provider)
    ),
  list: protectedProcedure.handler(
    async ({ context }) => await listConnections(context)
  ),
  // Connects a provider that takes the merchant's own API key (fal).
  saveKey: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().trim().min(16).max(512),
        provider: z.enum(keyProviderIds),
      })
    )
    .handler(async ({ context, input }) => {
      const result = await saveApiKey(context, input.provider, input.apiKey);
      await context.analytics?.capture({
        distinctId: context.userId,
        event: "connect_provider",
        properties: { provider: input.provider },
      });
      return result;
    }),
};
