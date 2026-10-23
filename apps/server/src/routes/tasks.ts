import { Hono } from "hono";
import { z } from "zod";

import { parseJson } from "../lib/reply-json.ts";
import { USER_ID } from "../optimizer/docs.ts";
import { runReasons } from "../optimizer/run.ts";
import type { Runner } from "../optimizer/run.ts";
import type { Scheduler } from "../optimizer/schedule.ts";

// /tasks/optimizer/*: Cloud Tasks and Cloud Scheduler call them with an OIDC
// token for the task service account, audience the full URL. Anything else
// gets 401. /run does one merchant's run; /poll and /daily fan out one run
// task per due merchant.

const bodySchema = z.object({
  reason: z.enum(runReasons).default("event"),
  uid: z.string().regex(USER_ID),
});

interface TaskRouteDeps {
  runner: Runner;
  scheduler: Scheduler;
  // Checks the request's bearer token for this audience.
  verify: (
    authorization: string | undefined,
    audience: string
  ) => Promise<boolean>;
  site: string;
}

export const createTaskRoutes = ({
  runner,
  scheduler,
  site,
  verify,
}: TaskRouteDeps) => {
  const app = new Hono();
  const allowed = async (authorization: string | undefined, path: string) =>
    await verify(authorization, `${site}${path}`);

  app.post("/tasks/optimizer/run", async (c) => {
    if (!(await allowed(c.req.header("authorization"), c.req.path))) {
      return c.text("Unauthorized", 401);
    }
    const body = bodySchema.safeParse(parseJson(await c.req.text()));
    if (!body.success) {
      // 200, not 4xx: a malformed task would only be retried.
      return c.json({ kind: "invalid" });
    }
    return c.json(await runner.run(body.data.uid, body.data.reason));
  });

  for (const [path, tick] of [
    ["/tasks/optimizer/poll", scheduler.pollTick],
    ["/tasks/optimizer/daily", scheduler.dailyTick],
  ] as const) {
    app.post(path, async (c) => {
      if (!(await allowed(c.req.header("authorization"), path))) {
        return c.text("Unauthorized", 401);
      }
      return c.json({ queued: await tick() });
    });
  }

  return app;
};
