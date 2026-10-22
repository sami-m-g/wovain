import { createHash, randomBytes } from "node:crypto";

import { auth } from "@modelcontextprotocol/client";
import type {
  FetchLike,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import {
  clientMetadata,
  clientMetadataUrl,
  confirmCallbackUrl,
} from "./oauth-client.ts";

// A human confirmation outside the chat: the merchant opens a link in their
// browser, signs in to wovain there (AuthKit, the same check /mcp makes), sees
// what they're confirming and presses Confirm. Nothing a model can call
// produces the confirmation; tool output carries only the link, which works
// once, for 5 minutes, and only for the merchant it was made for.
//
// The subject names what is confirmed and pins its exact content with a
// hash, so a change after the link was made isn't confirmed by it.
const subjectSchema = z.object({
  hash: z.string().min(1),
  id: z.string().min(1),
  // A design's approval, or turning autopilot on (id "autopilot", the hash
  // names the terms' version).
  kind: z.enum(["design", "autopilot"]),
});
export type Subject = z.infer<typeof subjectSchema>;

const TICKET_MS = 5 * 60 * 1000;
const FLOW_MS = 10 * 60 * 1000;

const expiring = { expiresAt: z.instanceof(Timestamp), userId: z.string() };
const ticketSchema = z.object({ ...expiring, subject: subjectSchema });
const flowSchema = z.object({
  ...expiring,
  codeVerifier: z.string().optional(),
  discoveryState: z.string().optional(),
  nonceHash: z.string(),
  subject: subjectSchema,
});
const sessionSchema = z.object({
  ...expiring,
  nonceHash: z.string(),
  subject: subjectSchema,
});

const newSecret = () => randomBytes(32).toString("base64url");
export const hashOf = (value: string) =>
  createHash("sha256").update(value).digest("base64url");

// The SDK's storage for one sign-in: the flow's verifier and discovery state
// in Firestore between the two legs, the tokens in memory only.
class ConfirmOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | undefined;
  readonly #flow: Partial<z.infer<typeof flowSchema>>;
  readonly #save: (patch: Record<string, string>) => Promise<unknown>;
  readonly #site: string;
  readonly #state: string;
  #tokens: StoredOAuthTokens | undefined;

  constructor(options: {
    flow: Partial<z.infer<typeof flowSchema>>;
    save: (patch: Record<string, string>) => Promise<unknown>;
    site: string;
    state: string;
  }) {
    this.#flow = options.flow;
    this.#save = options.save;
    this.#site = options.site;
    this.#state = options.state;
  }

  get clientMetadata() {
    return clientMetadata(this.#site);
  }

  get redirectUrl() {
    return confirmCallbackUrl(this.#site);
  }

  clientInformation(): StoredOAuthClientInformation {
    return { client_id: clientMetadataUrl(this.#site) };
  }

  codeVerifier() {
    const verifier = this.#flow.codeVerifier;
    if (verifier === undefined) {
      throw new Error("No pending sign-in");
    }
    return verifier;
  }

  discoveryState() {
    const saved = this.#flow.discoveryState;
    return saved === undefined
      ? undefined
      : z
          .custom<OAuthDiscoveryState>(
            (value) =>
              typeof value === "object" &&
              value !== null &&
              "authorizationServerUrl" in value
          )
          .parse(JSON.parse(saved));
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  async saveCodeVerifier(codeVerifier: string) {
    this.#flow.codeVerifier = codeVerifier;
    await this.#save({ codeVerifier });
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    const discoveryState = JSON.stringify(state);
    this.#flow.discoveryState = discoveryState;
    await this.#save({ discoveryState });
  }

  saveTokens(tokens: StoredOAuthTokens) {
    this.#tokens = tokens;
  }

  state() {
    return this.#state;
  }

  tokens() {
    return this.#tokens;
  }
}

export interface ConfirmRedirect {
  code: string;
  iss?: string | undefined;
  state: string;
}

interface Deps {
  db: Firestore;
  fetch?: FetchLike;
  now?: () => number;
  site: string;
  // The wovain user an AuthKit access token for /mcp belongs to, or
  // undefined for a token /mcp would refuse.
  userOf: (accessToken: string) => Promise<string | undefined>;
}

export const createBrowserConfirm = ({
  db,
  fetch = globalThis.fetch,
  now = Date.now,
  site,
  userOf,
}: Deps) => {
  const tickets = db.collection("confirmTickets");
  const flows = db.collection("confirmFlows");
  const sessions = db.collection("confirmSessions");
  const options = { fetchFn: fetch, scope: "openid", serverUrl: `${site}/mcp` };
  const expiry = (ms: number) => Timestamp.fromMillis(now() + ms);

  // Reads and deletes one single-use document; undefined when it's missing,
  // expired or fails `accept`.
  const take = async <T extends { expiresAt: Timestamp }>(
    ref: FirebaseFirestore.DocumentReference,
    schema: z.ZodType<T>,
    accept: (doc: T) => boolean = () => true
  ) =>
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.exists) {
        tx.delete(ref);
      }
      const parsed = schema.safeParse(doc.data());
      return parsed.success &&
        parsed.data.expiresAt.toMillis() > now() &&
        accept(parsed.data)
        ? parsed.data
        : undefined;
    });

  // AuthKit's sign-in page for a redeemed ticket, bound to this browser.
  const begin = async (
    redeemed: z.infer<typeof ticketSchema>,
    nonceHash: string
  ) => {
    const state = newSecret();
    const ref = flows.doc(state);
    const flow = {
      expiresAt: expiry(FLOW_MS),
      nonceHash,
      subject: redeemed.subject,
      userId: redeemed.userId,
    };
    await ref.set(flow);
    const oauth = new ConfirmOAuthProvider({
      flow,
      save: async (patch) => await ref.update(patch),
      site,
      state,
    });
    await auth(oauth, options);
    return oauth.authorizationUrl;
  };

  // The wovain user the tokens belong to, checked as /mcp checks them.
  const signedInAs = async (tokens: StoredOAuthTokens | undefined) =>
    tokens === undefined ? undefined : await userOf(tokens.access_token);

  // Exchanges the code; for the merchant the link was made for, a
  // single-use secret for the Confirm form.
  const check = async (
    flow: z.infer<typeof flowSchema>,
    { code, iss, state }: ConfirmRedirect
  ) => {
    const oauth = new ConfirmOAuthProvider({
      flow,
      save: async () => {
        await Promise.resolve();
      },
      site,
      state,
    });
    const exchange = { authorizationCode: code, ...options };
    await auth(oauth, iss === undefined ? exchange : { ...exchange, iss });
    if ((await signedInAs(oauth.tokens())) !== flow.userId) {
      return { matches: false as const };
    }
    const secret = newSecret();
    await sessions.doc(hashOf(secret)).set({
      expiresAt: expiry(FLOW_MS),
      nonceHash: flow.nonceHash,
      subject: flow.subject,
      userId: flow.userId,
    });
    return {
      matches: true as const,
      secret,
      subject: flow.subject,
      userId: flow.userId,
    };
  };

  return {
    // The Confirm POST: the form's secret, from the same browser. Returns
    // who confirmed what, once.
    confirm: async (secret: string, nonceHash: string) =>
      await take(
        sessions.doc(hashOf(secret)),
        sessionSchema,
        (doc) => doc.nonceHash === nonceHash
      ),

    // /confirm/callback: undefined when the flow isn't this browser's.
    finish: async (redirect: ConfirmRedirect & { nonceHash: string }) => {
      const flow = await take(
        flows.doc(redirect.state),
        flowSchema,
        (doc) => doc.nonceHash === redirect.nonceHash
      );
      return flow === undefined ? undefined : await check(flow, redirect);
    },

    // The link a tool hands out: /confirm/<ticket>.
    link: async (userId: string, subject: Subject) => {
      const ticket = newSecret();
      await tickets
        .doc(hashOf(ticket))
        .set({ expiresAt: expiry(TICKET_MS), subject, userId });
      return `${site}/confirm/${ticket}`;
    },

    // /confirm/:ticket: undefined for a used, expired or unknown ticket.
    start: async (ticket: string, nonceHash: string) => {
      const redeemed = await take(tickets.doc(hashOf(ticket)), ticketSchema);
      return redeemed === undefined
        ? undefined
        : await begin(redeemed, nonceHash);
    },
  };
};

export type BrowserConfirm = ReturnType<typeof createBrowserConfirm>;
