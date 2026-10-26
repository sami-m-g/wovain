import { auth } from "@/services";

import { captureServerException } from "./analytics";

// The signed-in merchant's user id, the distinct id the browser identifies
// with; undefined for a visitor, or when the session can't be read.
const userIdOf = async (
  requestHeaders: NodeJS.Dict<string | string[]>
): Promise<string | undefined> => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(requestHeaders)) {
    for (const item of [value ?? []].flat()) {
      headers.append(name, item);
    }
  }
  try {
    const session = await auth.api.getSession({
      headers,
      query: { disableRefresh: true },
    });
    return session?.user.id;
  } catch {
    return undefined;
  }
};

/**
 * Next's `onRequestError` for PostHog Error Tracking
 * (posthog.com/docs/error-tracking/installation/nextjs): an uncaught error
 * in a server render, route handler or server action becomes a `$exception`
 * event, sent before the hook returns. Only the route, never the request
 * body or the merchant's email, goes with it.
 */
export const captureRequestError = async (
  error: unknown,
  request: {
    headers: NodeJS.Dict<string | string[]>;
    method: string;
    path: string;
  },
  context: { routePath: string; routeType: string }
): Promise<void> => {
  await captureServerException(error, await userIdOf(request.headers), {
    method: request.method,
    // Without the query string, which can carry tokens.
    path: new URL(request.path, "http://localhost").pathname,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
