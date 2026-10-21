import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { html } from "hono/html";

import { siteUrl } from "./auth/env.ts";
import { signedOAuthQuery } from "./auth/oauth-query.ts";
import { consentPage, expiredPage } from "./pages/consent.ts";
import { page } from "./pages/page.ts";
import { signInPage } from "./pages/sign-in.ts";
import { createMcpRoute } from "./routes/mcp.ts";
import type { Runtime } from "./runtime.ts";

const formText = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? value : undefined;
};

// Better Auth answers a browser POST with JSON naming where to go next and
// sets its cookies; a plain form needs that as a redirect carrying them.
const redirectFrom = async (response: Response) => {
  const body: unknown = await response.json().catch(() => null);
  const url =
    typeof body === "object" && body !== null && "url" in body
      ? body.url
      : undefined;
  if (!response.ok || typeof url !== "string") {
    return null;
  }
  const headers = new Headers({ location: url });
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { headers, status: 303 });
};

// Every route wovain serves: /mcp for agents, Better Auth's OAuth endpoints
// and their metadata, and the sign-in and consent pages an agent sends the
// merchant to.
export const createApp = (runtime: Runtime) => {
  const { auth, authEnv } = runtime;
  const site = siteUrl(authEnv);
  const googleReady =
    authEnv.GOOGLE_CLIENT_ID !== undefined &&
    authEnv.GOOGLE_CLIENT_SECRET !== undefined;
  const mcp = createMcpRoute(runtime);

  // Calls a Better Auth endpoint the way its browser client would, with the
  // merchant's cookies and this site as the origin.
  const callAuth = async (
    request: Request,
    endpoint: string,
    body: Record<string, unknown>
  ) =>
    await auth.handler(
      new Request(`${site}/api/auth${endpoint}`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          cookie: request.headers.get("cookie") ?? "",
          origin: site,
        },
        method: "POST",
      })
    );

  const app = new Hono();

  // The pages' forms only post from this site.
  app.use("/sign-in", csrf({ origin: new URL(site).origin }));
  app.use("/consent", csrf({ origin: new URL(site).origin }));

  app.all("/mcp", async (c) => await mcp(c.req.raw));

  app.on(
    ["GET", "POST"],
    "/api/auth/*",
    async (c) => await auth.handler(c.req.raw)
  );

  // MCP clients look for OAuth metadata at the site root
  // (/.well-known/oauth-protected-resource/mcp and
  // /.well-known/oauth-authorization-server/api/auth); Better Auth's plugins
  // answer those paths when the request reaches its handler, and 404 the rest.
  app.get("/.well-known/*", async (c) => await auth.handler(c.req.raw));

  app.get(
    "/",
    async (c) =>
      await c.html(
        page(
          "wovain",
          html`<main class="panel">
            <h1>wovain</h1>
            <p>
              An MCP server for print-on-demand sellers. Connect your agent to
              <code>${site}/mcp</code>.
            </p>
          </main>`
        )
      )
  );

  app.get(
    "/sign-in",
    async (c) =>
      await c.html(
        signInPage({
          googleReady,
          oauthQuery: signedOAuthQuery(new URL(c.req.url).search),
        })
      )
  );

  // Inside an OAuth flow, Better Auth continues to the agent after Google.
  app.post("/sign-in", async (c) => {
    const oauthQuery = formText(await c.req.formData(), "oauth_query");
    const redirect = await redirectFrom(
      await callAuth(c.req.raw, "/sign-in/social", {
        callbackURL: "/",
        provider: "google",
        ...(oauthQuery === undefined ? {} : { oauth_query: oauthQuery }),
      })
    );
    return await (redirect ??
      c.html(
        signInPage({
          error: "Google sign-in didn’t start. Try again.",
          googleReady,
          oauthQuery,
        }),
        502
      ));
  });

  // The authorize step sends a signed query here; anything unsigned is refused.
  app.get("/consent", async (c) => {
    const query = new URL(c.req.url).searchParams;
    const { secret } = await auth.$context;
    const clientId = query.get("client_id");
    const oauthQuery = signedOAuthQuery(query.toString());
    if (
      clientId === null ||
      oauthQuery === undefined ||
      !(await verifyOAuthQueryParams(query.toString(), secret))
    ) {
      return await c.html(expiredPage(), 400);
    }
    const client = await auth.api
      .getOAuthClientPublic({
        headers: c.req.raw.headers,
        query: { client_id: clientId },
      })
      .catch(() => null);
    return await c.html(
      consentPage({
        clientName: client?.client_name,
        oauthQuery,
        redirectUri: query.get("redirect_uri"),
      })
    );
  });

  // After either answer, Better Auth names where the agent is waiting.
  app.post("/consent", async (c) => {
    const form = await c.req.formData();
    const oauthQuery = formText(form, "oauth_query");
    if (oauthQuery === undefined) {
      return await c.html(expiredPage(), 400);
    }
    const redirect = await redirectFrom(
      await callAuth(c.req.raw, "/oauth2/consent", {
        accept: formText(form, "accept") === "true",
        oauth_query: oauthQuery,
      })
    );
    return await (redirect ??
      c.html(
        page(
          "Allow access · wovain",
          html`<main class="panel">
            <h1>That didn’t go through</h1>
            <p>Start again from your agent.</p>
          </main>`
        ),
        502
      ));
  });

  return app;
};
