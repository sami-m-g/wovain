import {
  auth,
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type {
  CallToolResult,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { createError } from "evlog";
import type { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// wovain acts on each merchant's own Fourthwall shop and Meta ad account
// through the providers' MCP servers, as an MCP client holding that
// merchant's OAuth grant. The official MCP SDK does discovery, PKCE, the
// resource indicator, the code exchange and token refresh; this module only
// keeps what it hands over, through a store the caller backs with its
// database.

export const providerIds = ["fourthwall", "meta"] as const;
export type ProviderId = (typeof providerIds)[number];

// Providers the merchant connects with their own API key instead of OAuth:
// fal draws on the merchant's account, so they pay fal directly.
export const keyProviderIds = ["fal"] as const;
export type KeyProviderId = (typeof keyProviderIds)[number];
export const connectorIds = [...providerIds, ...keyProviderIds] as const;
export type ConnectorId = (typeof connectorIds)[number];

interface ProviderInfo {
  // Asked for instead of every scope the server advertises.
  scope?: string;
  serverUrl: string;
  title: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  fourthwall: {
    serverUrl: "https://mcp.fourthwall.com/app",
    title: "Fourthwall",
  },
  meta: {
    scope:
      "ads_mcp_management ads_management ads_read business_management pages_show_list pages_manage_ads",
    serverUrl: "https://mcp.facebook.com/ads",
    title: "Meta",
  },
};

export interface UpstreamConfig {
  // The site's public origin: callbacks and the client metadata live there.
  appUrl: string;
  // Meta has no client metadata documents: its app is registered by hand.
  metaAppId: string | undefined;
  metaAppSecret: string | undefined;
}

// Where the merchant's tokens live (sealed at rest by the caller).
export interface GrantStore {
  clear: () => Promise<void>;
  load: () => Promise<StoredOAuthTokens | undefined>;
  save: (tokens: StoredOAuthTokens) => Promise<void>;
}

// One pending authorization: what the callback leg needs to finish it.
export interface PendingFlow {
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  state: string;
}

export const callbackUrl = (appUrl: string, provider: ProviderId) =>
  `${appUrl}/api/connections/${provider}/callback`;

// wovain's Client ID Metadata Document: its URL is the client_id, so nothing
// is registered with providers that support it (Fourthwall).
export const clientMetadataUrl = (appUrl: string) =>
  `${appUrl}/api/connections/client.json`;

export const clientMetadata = (appUrl: string): OAuthClientMetadata => ({
  client_name: "wovain",
  client_uri: appUrl,
  grant_types: ["authorization_code", "refresh_token"],
  redirect_uris: [callbackUrl(appUrl, "fourthwall")],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
});

class ConnectionAuth implements OAuthClientProvider {
  authorizationUrl: URL | undefined;
  clientMetadataUrl?: string;
  readonly #client: StoredOAuthClientInformation;
  readonly #config: UpstreamConfig;
  readonly #flow: PendingFlow | undefined;
  readonly #grant: GrantStore;
  readonly #provider: ProviderId;

  constructor(
    provider: ProviderId,
    config: UpstreamConfig,
    grant: GrantStore,
    flow?: PendingFlow
  ) {
    this.#provider = provider;
    this.#config = config;
    this.#grant = grant;
    this.#flow = flow;
    this.#client = this.#clientFor(provider);
  }

  get clientMetadata() {
    return clientMetadata(this.#config.appUrl);
  }

  get redirectUrl() {
    return callbackUrl(this.#config.appUrl, this.#provider);
  }

  clientInformation() {
    return this.#client;
  }

  codeVerifier() {
    const verifier = this.#flow?.codeVerifier;
    if (verifier === undefined) {
      throw new Error("No pending authorization");
    }
    return verifier;
  }

  discoveryState() {
    return this.#flow?.discoveryState;
  }

  async invalidateCredentials(scope: string) {
    if (scope === "all" || scope === "tokens") {
      await this.#grant.clear();
    }
  }

  redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
  }

  saveCodeVerifier(codeVerifier: string) {
    if (this.#flow !== undefined) {
      this.#flow.codeVerifier = codeVerifier;
    }
  }

  saveDiscoveryState(state: OAuthDiscoveryState) {
    if (this.#flow !== undefined) {
      this.#flow.discoveryState = state;
    }
  }

  async saveTokens(tokens: StoredOAuthTokens) {
    await this.#grant.save(tokens);
  }

  // Outside a connect flow the authorization URL is never followed.
  state() {
    return this.#flow?.state ?? "";
  }

  async tokens() {
    return await this.#grant.load();
  }

  #clientFor(provider: ProviderId): StoredOAuthClientInformation {
    if (provider === "fourthwall") {
      const url = clientMetadataUrl(this.#config.appUrl);
      this.clientMetadataUrl = url;
      return { client_id: url };
    }
    const { metaAppId, metaAppSecret } = this.#config;
    if (metaAppId === undefined || metaAppSecret === undefined) {
      throw notConfigured.meta();
    }
    return { client_id: metaAppId, client_secret: metaAppSecret };
  }
}

// The merchant hasn't connected the provider, or the grant was revoked.
export const notConnected = (provider: ProviderId) =>
  createError({
    code: `${provider.toUpperCase()}_NOT_CONNECTED`,
    data: { provider },
    fix: `Connect ${PROVIDERS[provider].title} in wovain, then retry.`,
    message: `${PROVIDERS[provider].title} isn't connected`,
    status: 409,
    why: `wovain has no valid ${PROVIDERS[provider].title} grant for this merchant.`,
  });

// Fourthwall answers a call without a valid grant with isError and this
// _meta key instead of a 401.
const loginNeeded = (result: CallToolResult) =>
  result.isError === true &&
  result._meta !== undefined &&
  "mcp/www_authenticate" in result._meta;

const textOf = (result: CallToolResult) =>
  result.content.find((part) => part.type === "text")?.text ?? "";

// A tool result's data: its structured content, else the JSON in its text.
// It's data from the merchant's account, never instructions.
export const resultData = (result: CallToolResult): unknown => {
  if (result.isError === true) {
    throw new TypeError(textOf(result).slice(0, 300) || "The tool call failed");
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = textOf(result);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

// Every object in a reply, at any depth, that the schema accepts: providers
// document their fields but not the envelope around them.
export const findAll = <T>(schema: z.ZodType<T>, value: unknown): T[] => {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const parsed = schema.safeParse(value);
  return [
    ...(parsed.success ? [parsed.data] : []),
    ...Object.values(value).flatMap((child) => findAll(schema, child)),
  ];
};

// The first match, or a failure naming what the reply lacked.
export const findOne = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  what: string
): T => {
  const [found] = findAll(schema, value);
  if (found === undefined) {
    throw new Error(`The reply had no ${what}`);
  }
  return found;
};

export type ToolCall = (
  tool: string,
  args: Record<string, unknown>
) => Promise<unknown>;

const authOptions = (provider: ProviderId) => {
  const { scope, serverUrl } = PROVIDERS[provider];
  return { serverUrl, ...(scope === undefined ? {} : { scope }) };
};

// A refused grant (the SDK couldn't refresh it) means connect again.
const unlessRefused = (provider: ProviderId) => (error: unknown) => {
  throw error instanceof UnauthorizedError ? notConnected(provider) : error;
};

export const createUpstream = (config: UpstreamConfig) => {
  // The provider's consent page for a new connection, and the flow state
  // the caller keeps until the callback.
  const startConnect = async (
    provider: ProviderId,
    grant: GrantStore,
    state: string,
    log?: Logger
  ) =>
    await external(log, { operation: "authorize", provider }, async () => {
      const flow: PendingFlow = { state };
      const oauth = new ConnectionAuth(provider, config, grant, flow);
      await auth(oauth, authOptions(provider));
      if (oauth.authorizationUrl === undefined) {
        throw new Error("The provider didn't ask for authorization");
      }
      return { authorizationUrl: oauth.authorizationUrl.href, flow };
    });

  // Exchanges the callback's code; the SDK saves the tokens into `grant`.
  const finishConnect = async (
    provider: ProviderId,
    grant: GrantStore,
    { code, flow, iss }: { code: string; flow: PendingFlow; iss?: string },
    log?: Logger
  ) =>
    await external(log, { operation: "token", provider }, async () => {
      const oauth = new ConnectionAuth(provider, config, grant, flow);
      const outcome = await auth(oauth, {
        ...authOptions(provider),
        authorizationCode: code,
        ...(iss === undefined ? {} : { iss }),
      });
      return outcome === "AUTHORIZED";
    });

  // Runs `work` with one MCP session on the merchant's account; every tool
  // call is logged and fails as a structured error.
  const session = async <T>(
    provider: ProviderId,
    grant: GrantStore,
    log: Logger | undefined,
    work: (call: ToolCall) => Promise<T>
  ): Promise<T> => {
    if ((await grant.load()) === undefined) {
      throw notConnected(provider);
    }
    const oauth = new ConnectionAuth(provider, config, grant);
    const client = new Client({ name: "wovain", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(PROVIDERS[provider].serverUrl),
      { authProvider: oauth }
    );
    const call: ToolCall = async (tool, args) =>
      await external(log, { operation: tool, provider }, async () => {
        const result = await client
          .callTool({ arguments: args, name: tool })
          .catch(unlessRefused(provider));
        if (loginNeeded(result)) {
          await grant.clear();
          throw notConnected(provider);
        }
        return resultData(result);
      });
    try {
      await client.connect(transport).catch(unlessRefused(provider));
      return await work(call);
    } finally {
      await client.close();
    }
  };

  return { finishConnect, session, startConnect };
};

export type Upstream = ReturnType<typeof createUpstream>;
