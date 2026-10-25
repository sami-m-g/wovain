import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@wovain/api/routers/index";
import type { NextRequest } from "next/server";

import { createContext } from "@/context";
import { useLogger as getRequestLogger, withEvlog } from "@/lib/evlog";
import { identifyEvlogUser } from "@/lib/evlog-auth";

const rpcHandler = new RPCHandler(appRouter);
const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
});

const handleRequest = async (req: NextRequest) => {
  await identifyEvlogUser(req);
  // Procedures log onto this request's wide event through evlog's oRPC middleware
  const context = {
    ...(await createContext(req.headers)),
    log: getRequestLogger(),
  };

  const rpcResult = await rpcHandler.handle(req, {
    context,
    prefix: "/api/rpc",
  });
  if (rpcResult.response) {
    return rpcResult.response;
  }

  const apiResult = await apiHandler.handle(req, {
    context,
    prefix: "/api/rpc/api-reference",
  });
  if (apiResult.response) {
    return apiResult.response;
  }

  return new Response("Not found", { status: 404 });
};

export const GET = withEvlog(handleRequest);
export const POST = withEvlog(handleRequest);
export const PUT = withEvlog(handleRequest);
export const PATCH = withEvlog(handleRequest);
export const DELETE = withEvlog(handleRequest);
