import { ORPCError } from "@orpc/server";
import { providerIds } from "@wovain/core/upstream";
import { createError } from "evlog";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { useLogger as getRequestLogger, withEvlog } from "@/lib/evlog";
import { publicOrigin } from "@/lib/public-origin";
import { redirectWithin } from "@/lib/redirect";
import { routerClientFor } from "@/lib/router-client";

// OAuth's error code for a merchant who declined (RFC 6749, 4.1.2.1).
const DECLINED = "access_denied";

// The provider's redirect back after consent. The flow only completes for
// the merchant who started it, in a browser signed in as them; the page they
// came from gets `connected` or `connection_error` in its query.
const handleCallback = async (
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) => {
  const { provider } = await params;
  const parsed = z.enum(providerIds).safeParse(provider);
  const query = request.nextUrl.searchParams;
  const code = query.get("code");
  const state = query.get("state");
  const origin = publicOrigin();
  const failed = (reason: string) =>
    redirectWithin({
      origin,
      query: { connection_error: reason },
      target: "/dashboard",
    });
  if (!parsed.success || code === null || state === null) {
    const reason = query.get("error") ?? "invalid_callback";
    // A merchant declining consent is their choice; anything else is a
    // failure error tracking should see, grouped by its code and route.
    if (reason !== DECLINED) {
      getRequestLogger().error(
        createError({
          code: "CONNECTION_CALLBACK_FAILED",
          message: "The provider's callback came back without a grant",
          status: 502,
          why: reason.slice(0, 100),
        })
      );
    }
    return failed(reason);
  }
  const iss = query.get("iss") ?? undefined;
  const client = await routerClientFor(request);
  try {
    const { connected, returnTo } = await client.connections.complete({
      code,
      provider: parsed.data,
      state,
      ...(iss === undefined ? {} : { iss }),
    });
    return redirectWithin({
      origin,
      query: { [connected ? "connected" : "connection_error"]: parsed.data },
      target: returnTo,
    });
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error ? error : new Error(String(error))
    );
    return failed(error instanceof ORPCError ? error.code : "failed");
  }
};

export const GET = withEvlog(handleCallback);
