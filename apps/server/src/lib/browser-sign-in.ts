import { auth } from "@modelcontextprotocol/client";
import type { FetchLike } from "@modelcontextprotocol/client";

import type { Connections, Flow, ProviderId } from "./connections.ts";
import { FirestoreOAuthProvider } from "./oauth-client.ts";

interface Deps {
  connections: Connections;
  fetch?: FetchLike;
  site: string;
  // The wovain user an AuthKit access token for /mcp belongs to, or
  // undefined for a token /mcp would refuse (auth/auth.ts checks it).
  userOf: (accessToken: string) => Promise<string | undefined>;
}

interface Callback {
  code: string;
  iss?: string | undefined;
  state: string;
}

// Proves who opened a connect link: the merchant signs in to wovain in the
// browser before any provider sees them. wovain is an OAuth client of its own
// /mcp here (the same CIMD identity, AuthKit's sign-in and consent), and the
// access token it gets is checked like any /mcp token. The tokens are never
// stored.
export const createBrowserSignIn = ({
  connections,
  fetch = globalThis.fetch,
  site,
  userOf,
}: Deps) => {
  const options = { fetchFn: fetch, scope: "openid", serverUrl: `${site}/mcp` };

  const begin = async (
    userId: string,
    provider: ProviderId,
    nonceHash: string
  ) => {
    const state = await connections.createFlow({
      nonceHash,
      provider,
      purpose: "signin",
      userId,
    });
    const oauth = new FirestoreOAuthProvider({
      connections,
      flow: { state },
      provider,
      signIn: true,
      site,
      userId,
    });
    await auth(oauth, options);
    return oauth.authorizationUrl;
  };

  // /connect/:provider: redeems the single-use ticket and returns AuthKit's
  // sign-in page, or undefined for a bad ticket.
  const start = async (
    ticket: string,
    provider: ProviderId,
    nonceHash: string
  ) => {
    const userId = await connections.redeemTicket(ticket, provider);
    return userId === undefined
      ? undefined
      : await begin(userId, provider, nonceHash);
  };

  const check = async (flow: Flow, { code, iss, state }: Callback) => {
    const oauth = new FirestoreOAuthProvider({
      callback: true,
      connections,
      flow: { ...flow, state },
      provider: flow.provider,
      signIn: true,
      site,
      userId: flow.userId,
    });
    await auth(oauth, {
      ...options,
      authorizationCode: code,
      ...(iss === undefined ? {} : { iss }),
    });
    const token = oauth.tokens()?.access_token;
    const signedIn = token === undefined ? undefined : await userOf(token);
    return {
      matches: signedIn === flow.userId,
      provider: flow.provider,
      userId: flow.userId,
    };
  };

  // /oauth/callback/wovain: who signed in, and whether they're the merchant
  // the link was made for. Undefined when the flow isn't this browser's.
  const finish = async (redirect: Callback & { nonceHash: string }) => {
    const flow = await connections.takeFlow(
      redirect.state,
      "signin",
      redirect.nonceHash
    );
    return flow === undefined ? undefined : await check(flow, redirect);
  };

  return { finish, start };
};

export type BrowserSignIn = ReturnType<typeof createBrowserSignIn>;
