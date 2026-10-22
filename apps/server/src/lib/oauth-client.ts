import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { z } from "zod";

import { providerSchema } from "./connections.ts";
import type { Connections, Flow, Grant, ProviderId } from "./connections.ts";

// wovain's client identity, a Client ID Metadata Document: the URL it's
// served at is the client_id, so nothing is registered with the providers.
export const clientMetadataUrl = (site: string) => `${site}/oauth/client.json`;
export const callbackUrl = (site: string, provider: ProviderId) =>
  `${site}/oauth/callback/${provider}`;

export const clientMetadata = (site: string): OAuthClientMetadata => ({
  client_name: "wovain",
  client_uri: site,
  grant_types: ["authorization_code", "refresh_token"],
  logo_uri: `${site}/icon.png`,
  redirect_uris: providerSchema.options.map((provider) =>
    callbackUrl(site, provider)
  ),
  response_types: ["code"],
  token_endpoint_auth_method: "none",
});

// The SDK wrote this JSON itself (saveDiscoveryState); the check only
// confirms it's the object it saved.
const discoverySchema = z.custom<OAuthDiscoveryState>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "authorizationServerUrl" in value
);

interface Options {
  // The callback leg: the flow doc is already deleted, so nothing is saved.
  callback?: boolean;
  connections: Connections;
  // A pending authorization (the connect and callback routes).
  flow?: Pick<Flow, "codeVerifier" | "discoveryState"> & { state: string };
  // The stored grant (a proxied call).
  grant?: Grant;
  provider: ProviderId;
  site: string;
  userId: string;
}

// The SDK's OAuth client storage for one merchant and provider, over
// Firestore. The SDK does discovery, PKCE, state, the resource indicator,
// the code exchange and refresh; this class only keeps what it hands over.
export class FirestoreOAuthProvider implements OAuthClientProvider {
  // Set when the SDK wants the merchant to (re)authorize.
  authorizationUrl: URL | undefined;
  // Set when the SDK discarded the stored tokens (invalid_grant).
  invalidated = false;
  readonly #options: Options;
  #tokens: StoredOAuthTokens | undefined;

  constructor(options: Options) {
    this.#options = options;
    this.#tokens = options.grant?.tokens;
  }

  get clientMetadata() {
    return clientMetadata(this.#options.site);
  }

  get clientMetadataUrl() {
    return clientMetadataUrl(this.#options.site);
  }

  get redirectUrl() {
    return callbackUrl(this.#options.site, this.#options.provider);
  }

  // The grant version this provider read, for version-checked deletes.
  get version() {
    return this.#options.grant?.record.version;
  }

  clientInformation(): StoredOAuthClientInformation {
    return { client_id: this.clientMetadataUrl };
  }

  codeVerifier() {
    const verifier = this.#options.flow?.codeVerifier;
    if (verifier === undefined) {
      throw new Error("No pending authorization");
    }
    return verifier;
  }

  discoveryState() {
    const saved = this.#options.flow?.discoveryState;
    return saved === undefined
      ? undefined
      : discoverySchema.parse(JSON.parse(saved));
  }

  async invalidateCredentials(scope: string) {
    if (scope !== "all" && scope !== "tokens") {
      return;
    }
    const { connections, provider, userId } = this.#options;
    this.invalidated = true;
    this.#tokens = undefined;
    await connections.remove(userId, provider, this.version);
  }

  redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string) {
    await this.#saveFlow({ codeVerifier });
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    await this.#saveFlow({ discoveryState: JSON.stringify(state) });
  }

  async saveTokens(tokens: StoredOAuthTokens) {
    const { connections, provider, userId } = this.#options;
    this.#tokens = tokens;
    await connections.save(userId, provider, tokens);
  }

  // The flow id is the OAuth state; outside a connect flow no state is sent
  // anywhere, because the authorization URL is never followed.
  state() {
    return this.#options.flow?.state ?? "";
  }

  tokens() {
    return this.#tokens;
  }

  // Only a connect flow keeps what the callback leg needs.
  async #saveFlow(patch: Pick<Flow, "codeVerifier" | "discoveryState">) {
    const { callback, connections, flow } = this.#options;
    if (flow === undefined) {
      return;
    }
    Object.assign(flow, patch);
    if (callback !== true) {
      await connections.updateFlow(flow.state, patch);
    }
  }
}
