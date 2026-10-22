import { randomBytes } from "node:crypto";

import type { StoredOAuthTokens } from "@modelcontextprotocol/client";
import { Timestamp } from "firebase-admin/firestore";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { Cipher } from "./cipher.ts";

// The upstream MCP servers wovain connects to for a merchant, each with the
// merchant's own OAuth grant.
export const providers = {
  fal: { serverUrl: "https://mcp.fal.ai/mcp-relay", title: "fal" },
  fourthwall: {
    serverUrl: "https://mcp.fourthwall.com/app",
    title: "Fourthwall",
  },
} as const;
export const providerSchema = z.enum(["fourthwall", "fal"]);
export type ProviderId = z.infer<typeof providerSchema>;

// users/{uid}/connections/{provider}. The grant itself is only in
// `ciphertext`; `version` goes up on every write, so a writer can tell
// whether another instance changed the grant since it read it.
const connectionSchema = z.object({
  ciphertext: z.string(),
  connectedAt: z.int(),
  expiresAt: z.int().optional(),
  leaseId: z.string().optional(),
  leaseUntil: z.int().optional(),
  provider: providerSchema,
  refreshedAt: z.int(),
  version: z.int().positive(),
});
type ConnectionRecord = z.infer<typeof connectionSchema>;

// What the SDK saves (OAuthTokens plus the issuer), checked after decrypting.
const tokensSchema = z.looseObject({
  access_token: z.string(),
  expires_in: z.number().optional(),
  issuer: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string(),
});

// connectTickets/{id}: lets a browser tab, which has no MCP bearer token,
// start a connect flow for the merchant who asked for the link.
const ticketSchema = z.object({
  expiresAt: z.instanceof(Timestamp),
  provider: providerSchema,
  userId: z.string(),
});

// oauthFlows/{state}: one pending authorization. The SDK's discovery state is
// kept as the JSON it handed over.
const flowSchema = z.object({
  codeVerifier: z.string().optional(),
  discoveryState: z.string().optional(),
  expiresAt: z.instanceof(Timestamp),
  provider: providerSchema,
  userId: z.string(),
});
export type Flow = z.infer<typeof flowSchema>;

export interface Grant {
  record: ConnectionRecord;
  tokens: StoredOAuthTokens;
}

export type Lease =
  | { id: string; status: "held" }
  | { status: "busy" }
  | { status: "changed" };

// Tickets and flows expire after 10 minutes (and Firestore's TTL policy
// removes them later); a lease lasts as long as one token refresh may take.
const PENDING_MS = 10 * 60 * 1000;
const LEASE_MS = 20 * 1000;

const recordOf = (data: unknown) => connectionSchema.parse(data);

const newId = () => randomBytes(24).toString("base64url");

export const createConnections = (
  db: Firestore,
  cipher: Cipher,
  now: () => number = Date.now
) => {
  const connection = (userId: string, provider: ProviderId) =>
    db.collection("users").doc(userId).collection("connections").doc(provider);
  const tickets = db.collection("connectTickets");
  const flows = db.collection("oauthFlows");
  const transaction = async <T>(work: (tx: Transaction) => Promise<T>) =>
    await db.runTransaction(work, { maxAttempts: 10 });
  const expiry = () => Timestamp.fromMillis(now() + PENDING_MS);

  return {
    // Takes a lease to refresh the grant read at `version`: "changed" means
    // another instance already wrote a newer grant, "busy" that one is
    // refreshing it now.
    acquireLease: async (
      userId: string,
      provider: ProviderId,
      version: number
    ): Promise<Lease> =>
      await transaction(async (tx) => {
        const ref = connection(userId, provider);
        const doc = await tx.get(ref);
        if (!doc.exists) {
          return { status: "changed" };
        }
        const record = recordOf(doc.data());
        if (record.version !== version) {
          return { status: "changed" };
        }
        if ((record.leaseUntil ?? 0) > now()) {
          return { status: "busy" };
        }
        const id = newId();
        tx.update(ref, { leaseId: id, leaseUntil: now() + LEASE_MS });
        return { id, status: "held" };
      }),

    createFlow: async (userId: string, provider: ProviderId) => {
      const state = newId();
      await flows.doc(state).set({ expiresAt: expiry(), provider, userId });
      return state;
    },

    createTicket: async (userId: string, provider: ProviderId) => {
      const id = newId();
      await tickets.doc(id).set({ expiresAt: expiry(), provider, userId });
      return id;
    },

    read: async (
      userId: string,
      provider: ProviderId
    ): Promise<Grant | undefined> => {
      const ref = connection(userId, provider);
      const doc = await ref.get();
      if (!doc.exists) {
        return undefined;
      }
      const record = recordOf(doc.data());
      const plain = await cipher.decrypt(record.ciphertext, ref.path);
      return { record, tokens: tokensSchema.parse(JSON.parse(plain)) };
    },

    // Single use: the ticket is deleted whether or not it's still valid.
    redeemTicket: async (id: string, provider: ProviderId) =>
      await transaction(async (tx) => {
        const ref = tickets.doc(id);
        const doc = await tx.get(ref);
        const ticket = doc.exists ? ticketSchema.parse(doc.data()) : undefined;
        tx.delete(ref);
        const valid =
          ticket?.provider === provider && ticket.expiresAt.toMillis() > now();
        return valid ? ticket.userId : undefined;
      }),

    // Deletes the grant only if it's still the one read at `version`, so a
    // newer grant from another instance survives a stale failure.
    remove: async (userId: string, provider: ProviderId, version?: number) =>
      await transaction(async (tx) => {
        const ref = connection(userId, provider);
        const doc = await tx.get(ref);
        if (!doc.exists) {
          return false;
        }
        const stale =
          version !== undefined && recordOf(doc.data()).version !== version;
        if (!stale) {
          tx.delete(ref);
        }
        return !stale;
      }),

    // Encrypts and writes a grant, bumping its version and dropping any lease.
    save: async (
      userId: string,
      provider: ProviderId,
      tokens: StoredOAuthTokens
    ) => {
      const ref = connection(userId, provider);
      const ciphertext = await cipher.encrypt(JSON.stringify(tokens), ref.path);
      const at = now();
      await transaction(async (tx) => {
        const doc = await tx.get(ref);
        const current = doc.exists ? recordOf(doc.data()) : undefined;
        const record: ConnectionRecord = {
          ciphertext,
          connectedAt: current?.connectedAt ?? at,
          ...(tokens.expires_in === undefined
            ? {}
            : { expiresAt: at + tokens.expires_in * 1000 }),
          provider,
          refreshedAt: at,
          version: (current?.version ?? 0) + 1,
        };
        tx.set(ref, connectionSchema.parse(record));
      });
    },

    // Loads a pending flow and deletes it, so a code is exchanged once.
    takeFlow: async (state: string): Promise<Flow | undefined> =>
      await transaction(async (tx) => {
        const ref = flows.doc(state);
        const doc = await tx.get(ref);
        const flow = doc.exists ? flowSchema.parse(doc.data()) : undefined;
        tx.delete(ref);
        return flow !== undefined && flow.expiresAt.toMillis() > now()
          ? flow
          : undefined;
      }),

    updateFlow: async (
      state: string,
      patch: Pick<Partial<Flow>, "codeVerifier" | "discoveryState">
    ) => {
      await flows.doc(state).update(patch);
    },
  };
};

export type Connections = ReturnType<typeof createConnections>;
