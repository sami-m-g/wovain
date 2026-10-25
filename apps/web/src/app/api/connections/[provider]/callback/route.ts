import { ORPCError } from "@orpc/server";
import { providerIds } from "@wovain/core/upstream";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { useLogger as getRequestLogger, withEvlog } from "@/lib/evlog";
import { routerClientFor } from "@/lib/router-client";

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
  const failed = (reason: string) =>
    Response.redirect(
      new URL(`/dashboard?connection_error=${reason}`, request.url),
      302
    );
  if (!parsed.success || code === null || state === null) {
    return failed(query.get("error") ?? "invalid_callback");
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
    const back = new URL(returnTo, request.url);
    back.searchParams.set(
      connected ? "connected" : "connection_error",
      parsed.data
    );
    return Response.redirect(back, 302);
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error ? error : new Error(String(error))
    );
    return failed(error instanceof ORPCError ? error.code : "failed");
  }
};

export const GET = withEvlog(handleCallback);
