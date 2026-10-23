import { setTimeout as delay } from "node:timers/promises";

import { CloudTasksClient } from "@google-cloud/tasks";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

// Background work as Cloud Tasks: each task is one short POST back to this
// server, because App Hosting throttles the CPU once a response is sent.
// A task's name dedupes it: a second task with the same name is refused,
// which callers treat as success (the work is already queued).

export interface Task {
  body: Record<string, unknown>;
  // [A-Za-z0-9_-], at most 500 characters.
  name: string;
  // A path on this server, e.g. /tasks/optimizer/run.
  path: string;
  // Epoch ms; now when left out.
  scheduleAt?: number;
}

export interface TaskQueue {
  // False when a task with this name already exists.
  enqueue: (task: Task) => Promise<boolean>;
}

// gRPC's ALREADY_EXISTS: Cloud Tasks for a task name in use, Firestore's
// create() for a document that exists.
const ALREADY_EXISTS = 6;

export const isAlreadyExists = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === ALREADY_EXISTS;

// Task names allow only letters, digits, `_` and `-`.
export const taskName = (...parts: (number | string)[]) =>
  parts
    .join("-")
    .replaceAll(/[^\w-]/gu, "_")
    .slice(0, 500);

interface CloudTasksOptions {
  client?: Pick<CloudTasksClient, "createTask">;
  // projects/<project>/locations/<region>/queues/<queue>
  queue: string;
  // The account tasks call as; the handler checks its OIDC token.
  serviceAccount: string;
  site: string;
}

export const cloudTasks = ({
  client = new CloudTasksClient(),
  queue,
  serviceAccount,
  site,
}: CloudTasksOptions): TaskQueue => ({
  enqueue: async ({ body, name, path, scheduleAt }) => {
    const url = `${site}${path}`;
    try {
      await client.createTask({
        parent: queue,
        task: {
          httpRequest: {
            body: Buffer.from(JSON.stringify(body)).toString("base64"),
            headers: { "content-type": "application/json" },
            httpMethod: "POST",
            oidcToken: { audience: url, serviceAccountEmail: serviceAccount },
            url,
          },
          name: `${queue}/tasks/${name}`,
          ...(scheduleAt === undefined
            ? {}
            : { scheduleTime: { seconds: Math.ceil(scheduleAt / 1000) } }),
        },
      });
      return true;
    } catch (error) {
      if (isAlreadyExists(error)) {
        return false;
      }
      throw error;
    }
  },
});

// `pnpm dev` and tests: tasks live in this process. With `dispatch`, each new
// task runs at its scheduled time (dev); without it they're only recorded.
export const memoryTasks = (
  dispatch?: (task: Task) => Promise<unknown>,
  now: () => number = Date.now
) => {
  const tasks = new Map<string, Task>();
  const runLater = async (task: Task, run: NonNullable<typeof dispatch>) => {
    await delay(Math.max(0, (task.scheduleAt ?? 0) - now()), undefined, {
      ref: false,
    });
    try {
      await run(task);
    } catch (error) {
      console.error("task failed:", task.path, error);
    }
  };
  const enqueue = async (task: Task) => {
    if (tasks.has(task.name)) {
      return await Promise.resolve(false);
    }
    tasks.set(task.name, task);
    if (dispatch !== undefined) {
      // Not awaited: the caller answers now, the task runs later.
      void runLater(task, dispatch);
    }
    return await Promise.resolve(true);
  };
  return { enqueue, tasks };
};

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

interface VerifyOptions {
  audience: string;
  // The request's Authorization header.
  authorization: string | undefined;
  keys?: JWTVerifyGetKey;
  serviceAccount: string | undefined;
}

// True only for a Google-signed OIDC token for `audience`, issued to the
// task service account. Without a configured account every token fails.
export const verifyTaskToken = async ({
  audience,
  authorization,
  keys = googleKeys,
  serviceAccount,
}: VerifyOptions) => {
  const token = /^Bearer (?<token>\S+)$/u.exec(authorization ?? "")?.groups?.[
    "token"
  ];
  if (serviceAccount === undefined || token === undefined) {
    return false;
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      audience,
      issuer: GOOGLE_ISSUERS,
    });
    return (
      payload["email"] === serviceAccount && payload["email_verified"] === true
    );
  } catch {
    return false;
  }
};
