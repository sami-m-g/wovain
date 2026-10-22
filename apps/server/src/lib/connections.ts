import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { StoredOAuthTokens } from "@modelcontextprotocol/client";
import { Timestamp } from "firebase-admin/firestore";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

import type { Cipher } from "./cipher.ts";

interface Provider {
  // Registered by hand (no CIMD or DCR): needs the client ID from config.
  manualClient?: true;
  // Asked for instead of every scope the server advertises.
  scope?: string;
  serverUrl: string;
  title: string;
}

// The upstream MCP servers wovain connects to for a merchant, each with the
// merchant's own OAuth grant. Meta advertises nine scopes; wovain asks only
// for the ones its tools and App Review submission cover.
export const providers: Record<"fal" | "fourthwall" | "meta", Provider> = {
  fal: { serverUrl: "https://mcp.fal.ai/mcp-relay", title: "fal" },
  fourthwall: {
    serverUrl: "https://mcp.fourthwall.com/app",
    title: "Fourthwall",
  },
  meta: {
    manualClient: true,
    scope:
      "ads_mcp_management ads_management ads_read business_management pages_show_list pages_manage_ads",
    serverUrl: "https://mcp.facebook.com/ads",
    title: "Meta",
  },
};
export const providerSchema = z.enum(["fourthwall", "fal", "meta"]);
export type ProviderId = z.infer<typeof providerSchema>;

// users/{uid}/connections/{provider}. The grant itself is only in
// `ciphertext`; `version` goes up on every write, so a writer can tell
// whether another instance changed the grant since it read it.
const connectionSchema = z.object({
  ciphertext: z.string(),
  connectedAt: z.int(),
  expiresAt: z.int().optional(),
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

// oauthFlows/{state}: one pending authorization, either the merchant signing
// in to wovain in the browser ("signin") or authorizing a provider
// ("connect"). `userId` is the merchant the link was made for; `nonceHash`
// binds the flow to the browser that opened the link (its cookie). The SDK's
// discovery state is kept as the JSON it handed over.
const flowSchema = z.object({
  codeVerifier: z.string().optional(),
  discoveryState: z.string().optional(),
  expiresAt: z.instanceof(Timestamp),
  nonceHash: z.string(),
  provider: providerSchema,
  purpose: z.enum(["signin", "connect"]),
  userId: z.string(),
});
export type Flow = z.infer<typeof flowSchema>;

// launchTickets/{id}: the merchant pressed Launch on the campaign widget for
// this campaign. launch_campaign spends only with one, once.
const launchTicketSchema = z.object({
  campaignId: z.string(),
  expiresAt: z.instanceof(Timestamp),
  userId: z.string(),
});

export interface Grant {
  record: ConnectionRecord;
  tokens: StoredOAuthTokens;
}

// Connect links work for 5 minutes and flows for 10 (Firestore's TTL policy
// removes leftovers later); a lease lasts as long as one token refresh may
// take.
const TICKET_MS = 5 * 60 * 1000;
const LAUNCH_MS = 2 * 60 * 1000;
const FLOW_MS = 10 * 60 * 1000;
const LEASE_MS = 20 * 1000;

const recordOf = (data: unknown) => connectionSchema.parse(data);

const newId = () => randomBytes(24).toString("base64url");

// The browser nonce: a random cookie value, stored only as its hash.
export const newNonce = () => randomBytes(32).toString("base64url");
export const nonceHashOf = (nonce: string) =>
  createHash("sha256").update(nonce).digest("base64url");

export const createConnections = (
  db: Firestore,
  cipher: Cipher,
  now: () => number = Date.now
) => {
  const connection = (userId: string, provider: ProviderId) =>
    db.collection("users").doc(userId).collection("connections").doc(provider);
  const tickets = db.collection("connectTickets");
  const launches = db.collection("launchTickets");
  const flows = db.collection("oauthFlows");
  const transaction = async <T>(work: (tx: Transaction) => Promise<T>) =>
    await db.runTransaction(work, { maxAttempts: 10 });
  const expiry = (ms: number) => Timestamp.fromMillis(now() + ms);
  // Reads one grant's record and changes it in the same transaction.
  const withRecord = async <T>(
    userId: string,
    provider: ProviderId,
    work: (
      tx: Transaction,
      ref: DocumentReference,
      record: ConnectionRecord | undefined
    ) => T
  ) =>
    await transaction(async (tx) => {
      const ref = connection(userId, provider);
      const doc = await tx.get(ref);
      return work(tx, ref, doc.exists ? recordOf(doc.data()) : undefined);
    });

  return {
    // Takes a lease to refresh the grant read at `version`; false when
    // another instance already wrote a newer grant or is refreshing it now.
    acquireLease: async (
      userId: string,
      provider: ProviderId,
      version: number
    ) =>
      await withRecord(userId, provider, (tx, ref, record) => {
        const free =
          record?.version === version && (record.leaseUntil ?? 0) <= now();
        if (free) {
          tx.update(ref, { leaseUntil: now() + LEASE_MS });
        }
        return free;
      }),

    createFlow: async (
      flow: Pick<Flow, "nonceHash" | "provider" | "purpose" | "userId">
    ) => {
      const state = newId();
      await flows
        .doc(state)
        .set(flowSchema.parse({ ...flow, expiresAt: expiry(FLOW_MS) }));
      return state;
    },

    createLaunchTicket: async (userId: string, campaignId: string) => {
      const id = newId();
      await launches
        .doc(id)
        .set({ campaignId, expiresAt: expiry(LAUNCH_MS), userId });
      return id;
    },

    createTicket: async (userId: string, provider: ProviderId) => {
      const id = newId();
      await tickets
        .doc(id)
        .set({ expiresAt: expiry(TICKET_MS), provider, userId });
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

    // Single use, like a connect ticket: true only for this merchant and
    // campaign, within 2 minutes of the press.
    redeemLaunchTicket: async (
      id: string,
      userId: string,
      campaignId: string
    ) =>
      await transaction(async (tx) => {
        const ref = launches.doc(id);
        const doc = await tx.get(ref);
        const ticket = doc.exists
          ? launchTicketSchema.parse(doc.data())
          : undefined;
        tx.delete(ref);
        return (
          ticket?.userId === userId &&
          ticket.campaignId === campaignId &&
          ticket.expiresAt.toMillis() > now()
        );
      }),

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
      await withRecord(userId, provider, (tx, ref, record) => {
        const removable =
          record !== undefined &&
          (version === undefined || record.version === version);
        if (removable) {
          tx.delete(ref);
        }
        return removable;
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
      await withRecord(userId, provider, (tx, _ref, current) => {
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

    // Loads a pending flow for the browser holding its nonce and deletes it,
    // so a code is exchanged once. Another browser's request leaves the flow
    // alone and gets nothing.
    takeFlow: async (
      state: string,
      purpose: Flow["purpose"],
      nonceHash: string
    ): Promise<Flow | undefined> =>
      await transaction(async (tx) => {
        const ref = flows.doc(state);
        const doc = await tx.get(ref);
        const flow = doc.exists ? flowSchema.parse(doc.data()) : undefined;
        const mine =
          flow !== undefined &&
          flow.purpose === purpose &&
          flow.nonceHash.length === nonceHash.length &&
          timingSafeEqual(Buffer.from(flow.nonceHash), Buffer.from(nonceHash));
        if (mine) {
          tx.delete(ref);
        }
        return mine && flow.expiresAt.toMillis() > now() ? flow : undefined;
      }),

    updateFlow: async (
      state: string,
      patch: Pick<Partial<Flow>, "codeVerifier" | "discoveryState">
    ) => {
      await flows.doc(state).update(patch);
    },

    // The grant's version without decrypting it, for version checks.
    version: async (userId: string, provider: ProviderId) => {
      const doc = await connection(userId, provider).get();
      return doc.exists ? recordOf(doc.data()).version : undefined;
    },
  };
};

export type Connections = ReturnType<typeof createConnections>;
