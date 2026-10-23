import { Hono } from "hono";
import { z } from "zod";

import { parseJson } from "../lib/reply-json.ts";
import { USER_ID } from "../optimizer/docs.ts";
import type { Runner } from "../optimizer/run.ts";

// /tasks/optimizer/run: Cloud Tasks call it with an OIDC token for the task
// service account, audience the full URL. Anything else gets 401.

const bodySchema = z.object({
  reason: z.string().max(40),
  uid: z.string().regex(USER_ID),
});

interface TaskRouteDeps {
  runner: Runner;
  // Checks the request's bearer token for this audience.
  verify: (
    authorization: string | undefined,
    audience: string
  ) => Promise<boolean>;
  site: string;
}

export const createTaskRoutes = ({ runner, site, verify }: TaskRouteDeps) => {
  const app = new Hono();
  const path = "/tasks/optimizer/run";

  app.post(path, async (c) => {
    if (!(await verify(c.req.header("authorization"), `${site}${path}`))) {
      return c.text("Unauthorized", 401);
    }
    const body = bodySchema.safeParse(parseJson(await c.req.text()));
    if (!body.success) {
      // 200, not 4xx: a malformed task would only be retried.
      return c.json({ kind: "invalid" });
    }
    return c.json(await runner.run(body.data.uid));
  });

  return app;
};
