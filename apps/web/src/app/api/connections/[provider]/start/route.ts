import { ORPCError } from "@orpc/server";
import { providerIds } from "@wovain/core/upstream";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { withEvlog } from "@/lib/evlog";
import { publicOrigin } from "@/lib/public-origin";
import { redirectWithin } from "@/lib/redirect";
import { routerClientFor } from "@/lib/router-client";

// Connect link (from the website or a ChatGPT tool result): sends the
// signed-in merchant to the provider's consent page, or to sign in first.
const handleStart = async (
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) => {
  const { provider } = await params;
  const parsed = z.enum(providerIds).safeParse(provider);
  if (!parsed.success) {
    return new Response("Unknown provider", { status: 404 });
  }
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? undefined;
  const client = await routerClientFor(request);
  try {
    const { authorizationUrl } = await client.connections.connect({
      provider: parsed.data,
      ...(returnTo === undefined ? {} : { returnTo }),
    });
    // The provider's consent page: the API builds it from the provider's
    // configured authorization endpoint, never from this request.
    // nosemgrep
    return Response.redirect(authorizationUrl, 302);
  } catch (error) {
    if (!(error instanceof ORPCError)) {
      throw error;
    }
    const origin = publicOrigin();
    return error.code === "UNAUTHORIZED"
      ? redirectWithin({ origin, target: "/login" })
      : redirectWithin({
          origin,
          query: { connection_error: error.code },
          target: "/dashboard",
        });
  }
};

export const GET = withEvlog(handleStart);
