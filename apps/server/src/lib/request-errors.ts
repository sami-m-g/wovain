import { AsyncLocalStorage } from "node:async_hooks";

import type { MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";

// What the self-healing loop's scout reads from production (apps/ops/src/
// google.ts): one structured log line per failed request, built only from
// values the server controls. The route is the pattern Hono matched, with the
// method it was registered for, never the path the caller sent; the error is
// its class name, never its message. Cloud Run turns the JSON line into
// jsonPayload, and the scout reads nothing else from it.

interface Facts {
  done: boolean;
  errorClass?: string;
  label?: string;
  route?: string;
}

const requests = new AsyncLocalStorage<Facts>();

const classOf = (error: unknown) =>
  error instanceof Error ? error.name : "unknown";

const write = (
  label: string,
  fields: { errorClass: string; route?: string; status?: number }
) => {
  console.error(
    JSON.stringify({ message: label, severity: "ERROR", wovain: fields })
  );
};

// Records a handled error's class for the request it happened in; outside a
// request, or after its response went out (a streamed MCP reply), it logs it
// right away. The label is a constant from the caller's code.
export const recordError = (label: string, error: unknown) => {
  const facts = requests.getStore();
  if (facts !== undefined && !facts.done) {
    facts.errorClass ??= classOf(error);
    facts.label ??= label;
    return;
  }
  write(label, {
    errorClass: classOf(error),
    ...(facts?.route === undefined ? {} : { route: facts.route }),
  });
};

// Logs a request that answered 5xx, threw, or recorded a handled error.
export const requestErrors: MiddlewareHandler = async (c, next) => {
  const facts: Facts = { done: false };
  try {
    await requests.run(facts, next);
  } finally {
    // After next(), routeIndex is the handler that answered.
    const matched = matchedRoutes(c).at(c.req.routeIndex);
    facts.route =
      matched === undefined ? "unmatched" : `${matched.method} ${matched.path}`;
    facts.done = true;
  }
  const errorClass =
    c.error === undefined ? facts.errorClass : classOf(c.error);
  if (c.res.status >= 500 || errorClass !== undefined) {
    write(facts.label ?? "request failed", {
      errorClass: errorClass ?? "unknown",
      route: facts.route,
      status: c.res.status,
    });
  }
};
