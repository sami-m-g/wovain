import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type {
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";

import { expect, isSmoke, test } from "./fixtures";

// Use case 9: an MCP client (the official SDK's) registers itself, sends
// the merchant through wovain's OAuth consent, then lists the tools.
const REDIRECT = "http://127.0.0.1:8765/callback";

// The SDK's OAuth client state, kept in memory for one test.
const memoryProvider = (onAuthorize: (url: URL) => void) => {
  let client: StoredOAuthClientInformation | undefined;
  let tokens: StoredOAuthTokens | undefined;
  let verifier = "";
  const provider: OAuthClientProvider = {
    clientInformation: () => client,
    get clientMetadata() {
      return {
        client_name: "wovain e2e",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [REDIRECT],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },
    codeVerifier: () => verifier,
    redirectToAuthorization: onAuthorize,
    get redirectUrl() {
      return REDIRECT;
    },
    saveClientInformation: (information) => {
      client = information;
    },
    saveCodeVerifier: (value) => {
      verifier = value;
    },
    saveTokens: (value) => {
      tokens = value;
    },
    tokens: () => tokens,
  };
  return provider;
};

test("an MCP client connects through OAuth and lists the tools", async ({
  baseURL,
  merchant: _merchant,
  page,
}) => {
  test.skip(isSmoke, "Registers an OAuth client on the server");
  const mcpUrl = new URL("/api/mcp", baseURL);
  let authorization: URL | undefined;
  const provider = memoryProvider((url) => {
    authorization = url;
  });

  const first = new StreamableHTTPClientTransport(mcpUrl, {
    authProvider: provider,
  });
  await expect(
    new Client({ name: "wovain-e2e", version: "1.0.0" }).connect(first)
  ).rejects.toBeInstanceOf(UnauthorizedError);
  expect(authorization).toBeDefined();

  // The signed-in merchant allows access; the browser lands on the
  // client's redirect with the code.
  await page.route(`${REDIRECT}**`, (route) => route.fulfill({ body: "ok" }));
  await page.goto(String(authorization));
  const callback = page.waitForRequest(`${REDIRECT}**`);
  await page.getByRole("button", { name: "Allow" }).click();
  const redirected = await callback;
  const { searchParams } = new URL(redirected.url());
  await first.finishAuth(searchParams);

  const client = new Client({ name: "wovain-e2e", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider })
  );
  const { tools } = await client.listTools();
  expect(tools.length).toBeGreaterThan(0);
  await client.close();
});
