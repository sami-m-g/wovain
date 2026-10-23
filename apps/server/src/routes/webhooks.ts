import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { Intake } from "../optimizer/intake.ts";
import { tokenMatches } from "../optimizer/signatures.ts";

// /webhooks/fourthwall and /webhooks/meta: signed events from the merchant's
// shop and ad account. Bodies over 1 MB are refused before they're read.
const MAX_BODY = 1024 * 1024;

const CHALLENGE = /^[\w-]{1,200}$/u;

interface WebhookDeps {
  intake: Intake;
  metaVerifyToken?: string | undefined;
}

export const createWebhookRoutes = ({
  intake,
  metaVerifyToken,
}: WebhookDeps) => {
  const app = new Hono();
  const limit = bodyLimit({
    maxSize: MAX_BODY,
    onError: (c) => c.text("Too large", 413),
  });

  app.post("/webhooks/fourthwall", limit, async (c) => {
    const { note, status } = await intake.fourthwall(await c.req.text(), {
      apps: c.req.header("x-fourthwall-hmac-apps-sha256"),
      shop: c.req.header("x-fourthwall-hmac-sha256"),
    });
    return c.text(note, status);
  });

  // Meta's subscription check: echo hub.challenge for our verify token.
  app.get("/webhooks/meta", (c) => {
    const challenge = c.req.query("hub.challenge") ?? "";
    const verified =
      c.req.query("hub.mode") === "subscribe" &&
      tokenMatches(c.req.query("hub.verify_token"), metaVerifyToken) &&
      CHALLENGE.test(challenge);
    return verified ? c.text(challenge) : c.text("Forbidden", 403);
  });

  app.post("/webhooks/meta", limit, async (c) => {
    const { note, status } = await intake.meta(
      await c.req.text(),
      c.req.header("x-hub-signature-256")
    );
    return c.text(note, status);
  });

  return app;
};
