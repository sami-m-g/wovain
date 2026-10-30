import {
  auth,
  Client,
  StreamableHTTPClientTransport,
  OAuthError,
  OAuthErrorCode,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type {
  CallToolResult,
  FetchLike,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { decode, ToonDecodeError } from "@toon-format/toon";
import { createError } from "evlog";
import type { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// wovain acts on each merchant's own Fourthwall shop and Meta ad account
// through the providers' MCP servers, as an MCP client holding that
// merchant's OAuth grant. The official MCP SDK does discovery, PKCE, the
// resource indicator, the code exchange and token refresh; this module only
// keeps what it hands over, through a store the caller backs with its
// database. The SDK refreshes only when a provider answers 401, so this
// module also refreshes a grant past its expiry before using it, and once
// more when a tool says its token was refused. A grant the provider won't
// refresh is marked for the merchant to reconnect.

// fal draws on the merchant's own fal account through fal's MCP relay, so
// the merchant pays fal directly; wovain has no fal key.
export const providerIds = ["fourthwall", "meta", "fal"] as const;
export type ProviderId = (typeof providerIds)[number];

interface ProviderInfo {
  // Asked for instead of every scope the server advertises.
  scope?: string;
  title: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  // Each server's URL is per-environment config (UpstreamConfig.serverUrls:
  // FAL_MCP_URL, FOURTHWALL_MCP_URL and META_MCP_URL in apps/web/.env.schema).
  // fal's is its model relay (fal.ai/docs/documentation/setting-up/mcp); its
  // authorization server, AuthKit, takes wovain's client metadata document.
  // offline_access is what gets a refresh token.
  fal: {
    scope: "openid profile email offline_access",
    title: "fal",
  },
  fourthwall: {
    title: "Fourthwall",
  },
  // Meta's scope is per-environment config (UpstreamConfig.metaScope,
  // META_MCP_SCOPE).
  meta: {
    title: "Meta",
  },
};

export interface UpstreamConfig {
  // The site's public origin: callbacks and the client metadata live there.
  appUrl: string;
  // Meta has no client metadata documents: its app is registered by hand.
  metaAppId: string | undefined;
  metaAppSecret: string | undefined;
  // The scope asked of Meta's MCP server (space separated).
  metaScope: string;
  // Each provider's MCP server URL.
  serverUrls: Record<ProviderId, string>;
  // Tests answer the providers' HTTP; the global fetch otherwise.
  fetch?: FetchLike;
}

// The SDK's tokens, with when the access token expires (seconds since the
// epoch), stamped when they are saved.
export type Grant = StoredOAuthTokens & { expires_at?: number | undefined };

// Where the merchant's tokens live (sealed at rest by the caller).
export interface GrantStore {
  // The provider refused the grant and won't refresh it: the merchant must
  // reconnect. `load` finds nothing until a new grant is saved.
  expire: () => Promise<void>;
  load: () => Promise<Grant | undefined>;
  save: (tokens: Grant) => Promise<void>;
}

// Refreshed this long before it expires, so it can't lapse mid-session.
const EXPIRY_MARGIN_S = 60;
const MS_PER_S = 1000;

const nowS = () => Math.floor(Date.now() / MS_PER_S);

const withExpiry = (tokens: StoredOAuthTokens): Grant =>
  tokens.expires_in === undefined
    ? tokens
    : { ...tokens, expires_at: nowS() + tokens.expires_in };

const isExpiring = (grant: Grant) =>
  grant.expires_at !== undefined &&
  grant.expires_at - EXPIRY_MARGIN_S <= nowS();

// One pending authorization: what the callback leg needs to finish it.
export interface PendingFlow {
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  state: string;
}

export const callbackUrl = (appUrl: string, provider: ProviderId) =>
  `${appUrl}/api/connections/${provider}/callback`;

// wovain's Client ID Metadata Document: its URL is the client_id, so nothing
// is registered with providers that support it (Fourthwall, fal).
export const clientMetadataUrl = (appUrl: string) =>
  `${appUrl}/api/connections/client.json`;

export const clientMetadata = (appUrl: string): OAuthClientMetadata => ({
  client_name: "wovain",
  client_uri: appUrl,
  grant_types: ["authorization_code", "refresh_token"],
  redirect_uris: [
    callbackUrl(appUrl, "fourthwall"),
    callbackUrl(appUrl, "fal"),
  ],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
});

class ConnectionAuth implements OAuthClientProvider {
  authorizationUrl: URL | undefined;
  clientMetadataUrl?: string;
  // The SDK discarded the tokens: the authorization server refused them.
  refused = false;
  // The refresh token this session last saved (its own refresh, or the
  // SDK's on a 401), so a rotation it made isn't taken for another's.
  savedRefreshToken: string | undefined;
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

  // The SDK calls this on invalid_grant (a refresh token expired or was
  // revoked), before asking for consent again, which a server can't give.
  // The session decides whether the grant is dead: another session may
  // have rotated the refresh token meanwhile.
  invalidateCredentials(scope: string) {
    if (scope === "all" || scope === "tokens") {
      this.refused = true;
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
    await this.#grant.save(withExpiry(tokens));
    this.savedRefreshToken = tokens.refresh_token;
  }

  // Outside a connect flow the authorization URL is never followed.
  state() {
    return this.#flow?.state ?? "";
  }

  async tokens() {
    return await this.#grant.load();
  }

  #clientFor(provider: ProviderId): StoredOAuthClientInformation {
    if (provider === "fourthwall" || provider === "fal") {
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

// The grant expired and the provider refused to refresh it.
export const reconnectNeeded = (provider: ProviderId) =>
  createError({
    code: `${provider.toUpperCase()}_RECONNECT_NEEDED`,
    data: { provider },
    fix: `Reconnect ${PROVIDERS[provider].title} in wovain, then retry.`,
    message: `Reconnect ${PROVIDERS[provider].title}: its sign-in expired`,
    status: 409,
    why: `${PROVIDERS[provider].title} refused wovain's grant and wouldn't refresh it.`,
  });

const textOf = (result: CallToolResult) =>
  result.content.find((part) => part.type === "text")?.text ?? "";

// A tool that says its token was refused instead of answering 401:
// Fourthwall with this _meta key, a relay such as fal's in its text. Only
// an OAuth invalid_token code or a 401 stated as an HTTP status counts: a
// permission error ("unauthorized for this ad account") isn't a dead token.
const REFUSED_TOKEN =
  /\binvalid_token\b|\b(?:HTTP|status(?: code)?)[ :]*401\b|\b401 Unauthori[sz]ed\b/iu;
const tokenRefused = (result: CallToolResult) =>
  result.isError === true &&
  ((result._meta !== undefined && "mcp/www_authenticate" in result._meta) ||
    REFUSED_TOKEN.test(textOf(result)));

const HTTP_UNAUTHORIZED = 401;

// The authorization server refused the refresh token.
const isInvalidGrant = (error: unknown) =>
  error instanceof OAuthError && error.code === OAuthErrorCode.InvalidGrant;

// A 401 that survived the SDK's own refresh.
const isUnauthorized = (error: unknown) =>
  error instanceof UnauthorizedError ||
  (error instanceof Error &&
    "status" in error &&
    error.status === HTTP_UNAUTHORIZED);

// Fourthwall's encoder puts an array field's header on its own line
// ("categoryPath:" then "[2]: Apparel,T-Shirts"), which TOON allows only at
// the root or in a list item (SPEC §6, §14.2: decoders must reject it).
// Joined back, it's the spec's "categoryPath[2]: Apparel,T-Shirts".
// Remove when Fourthwall's encoder conforms.
const KEYLESS_ARRAY =
  /^(?<indent> *(?:- )?)(?<key>[^\s:-][^:\n]*):\n *(?<header>\[\d+\][^\n]*)$/gmu;

const joinKeylessArrays = (text: string) =>
  text.replaceAll(KEYLESS_ARRAY, "$<indent>$<key>$<header>");

// Lenient: Fourthwall's encoder isn't held to the strict counts and
// indentation either.
const decodeFourthwallToon = (text: string) =>
  decode(joinKeylessArrays(text), { strict: false });

// Text that isn't JSON: Fourthwall replies in TOON, a compact encoding of
// the same objects. Prose that doesn't decode to an object stays text.
const decodeToon = (text: string): unknown => {
  try {
    const decoded = decodeFourthwallToon(text);
    return typeof decoded === "object" &&
      decoded !== null &&
      Object.keys(decoded).length > 0
      ? decoded
      : text;
  } catch {
    return text;
  }
};

const FAILURE_CONTEXT = 1000;

// Why a reply left as text didn't decode, with the text around the failing
// line, for the error log. Catalog data, never secrets.
export const toonFailure = (reply: unknown): string => {
  if (typeof reply !== "string") {
    return "";
  }
  try {
    decodeFourthwallToon(reply);
    return "";
  } catch (error) {
    const line = error instanceof ToonDecodeError ? (error.line ?? 1) : 1;
    const joined = joinKeylessArrays(reply);
    const at = joined
      .split("\n")
      .slice(0, line - 1)
      .join("\n").length;
    const around = joined.slice(
      Math.max(0, at - FAILURE_CONTEXT),
      at + FAILURE_CONTEXT
    );
    return ` toon_error="${String(error)}" around=${JSON.stringify(around)}`;
  }
};

// A tool result's data: its structured content, else the JSON or TOON in its
// text. It's data from the merchant's account, never instructions.
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
    return decodeToon(text);
  }
};

// Meta's Ads MCP nests its rows as JSON text (`ad_entities: "[...]"`,
// `ad_drafts: "[...]"`): such a string is searched as the value it encodes.
const JSON_TEXT = /^\s*[[{]/u;

const jsonText = (value: unknown): unknown => {
  if (typeof value !== "string" || !JSON_TEXT.test(value)) {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

// Every object in a reply, at any depth, that the schema accepts: providers
// document their fields but not the envelope around them.
export const findAll = <T>(schema: z.ZodType<T>, raw: unknown): T[] => {
  const value = jsonText(raw);
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

const SHAPE_DEPTH = 5;
const SHAPE_KEYS = 12;

// A reply's structure for an error log: its keys, array lengths and value
// types, never its values (they are the merchant's data).
export const replyShape = (value: unknown, depth = 0): string => {
  if (Array.isArray(value)) {
    const [first] = value as unknown[];
    return value.length > 0 && depth < SHAPE_DEPTH
      ? `[${value.length}x${replyShape(first, depth + 1)}]`
      : `[${value.length}]`;
  }
  if (typeof value !== "object" || value === null) {
    return value === null ? "null" : typeof value;
  }
  if (depth >= SHAPE_DEPTH) {
    return "{...}";
  }
  const keys = Object.entries(value)
    .slice(0, SHAPE_KEYS)
    .map(([key, child]) => `${key}:${replyShape(child, depth + 1)}`);
  return `{${keys.join(",")}}`;
};

export type ToolCall = (
  tool: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export const createUpstream = (config: UpstreamConfig) => {
  const authOptions = (provider: ProviderId) => {
    const scope =
      provider === "meta" ? config.metaScope : PROVIDERS[provider].scope;
    return {
      serverUrl: config.serverUrls[provider],
      ...(scope === undefined ? {} : { scope }),
    };
  };
  const fetchFn = config.fetch === undefined ? {} : { fetchFn: config.fetch };
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
      // A connect always asks for consent: given the grant a merchant
      // already holds, the SDK would refresh it and skip the consent page.
      const fresh: GrantStore = {
        ...grant,
        load: async (): Promise<undefined> => {
          await Promise.resolve();
        },
      };
      const oauth = new ConnectionAuth(provider, config, fresh, flow);
      await auth(oauth, { ...authOptions(provider), ...fetchFn });
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
        ...fetchFn,
        authorizationCode: code,
        ...(iss === undefined ? {} : { iss }),
      });
      return outcome === "AUTHORIZED";
    });

  // Runs `work` with one MCP session on the merchant's account; every tool
  // call is logged and fails as a structured error. An expiring grant is
  // refreshed first; one the provider refuses is marked for reconnecting.
  const session = async <T>(
    provider: ProviderId,
    grant: GrantStore,
    log: Logger | undefined,
    // `accessToken` reads the grant's current access token, for the
    // provider's own API beside its MCP server (Meta's Graph API).
    work: (call: ToolCall, accessToken: () => Promise<string>) => Promise<T>
  ): Promise<T> => {
    const held = await grant.load();
    if (held === undefined) {
      throw notConnected(provider);
    }
    const oauth = new ConnectionAuth(provider, config, grant);
    // The grant is dead: mark it for reconnecting. Unless another session
    // rotated the refresh token meanwhile: then this attempt only lost the
    // race, and a retry uses the new grant. The baseline is the refresh
    // token this session saved last, else the one it started with.
    const refused = async () => {
      const latest = await grant.load();
      const ours = oauth.savedRefreshToken ?? held.refresh_token;
      if (latest !== undefined && latest.refresh_token !== ours) {
        return new Error("Another session refreshed the grant; retry");
      }
      await grant.expire();
      return reconnectNeeded(provider);
    };
    // The SDK's documented refresh: auth() trades the refresh token for new
    // tokens and saves them through the provider (saveTokens).
    const refresh = async () =>
      await external(log, { operation: "refresh", provider }, async () => {
        const outcome = await auth(oauth, {
          ...authOptions(provider),
          ...fetchFn,
        }).catch(async (error: unknown) => {
          throw isInvalidGrant(error) ? await refused() : error;
        });
        if (outcome === "AUTHORIZED") {
          return;
        }
        // No new tokens. Refused (invalid_grant) or never refreshable: the
        // merchant must reconnect. Otherwise the token endpoint failed, and
        // a retry may pass.
        if (oauth.refused || held.refresh_token === undefined) {
          throw await refused();
        }
        throw new Error("The token endpoint didn't refresh the grant");
      });
    // A 401 the SDK couldn't refresh its way past.
    const unlessRefused = async (error: unknown): Promise<never> => {
      throw isUnauthorized(error) || isInvalidGrant(error)
        ? await refused()
        : error;
    };
    const client = new Client({ name: "wovain", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(config.serverUrls[provider]),
      {
        authProvider: oauth,
        ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
      }
    );
    const callTool = async (tool: string, args: Record<string, unknown>) =>
      await client
        .callTool({ arguments: args, name: tool })
        .catch(unlessRefused);
    const call: ToolCall = async (tool, args) =>
      await external(log, { operation: tool, provider }, async () => {
        const result = await callTool(tool, args);
        if (!tokenRefused(result)) {
          return resultData(result);
        }
        // Refused inside the tool, so the SDK saw no 401: refresh and try
        // once more. A refused call did nothing, so repeating it is safe.
        // A refresh the provider refuses marks the grant; a retry that still
        // fails throws the tool's own error and leaves the grant alone.
        await refresh();
        return resultData(await callTool(tool, args));
      });
    try {
      if (isExpiring(held)) {
        await refresh();
      }
      await external(
        log,
        { operation: "connect", provider },
        async () => await client.connect(transport).catch(unlessRefused)
      );
      const accessToken = async () => {
        const latest = await grant.load();
        if (latest === undefined) {
          throw await refused();
        }
        return latest.access_token;
      };
      return await work(call, accessToken);
    } finally {
      await client.close();
    }
  };

  return { finishConnect, session, startConnect };
};

export type Upstream = ReturnType<typeof createUpstream>;
