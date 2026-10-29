import {
  StandardRPCJsonSerializer,
  StandardRPCSerializer,
} from "@orpc/client/standard";
import { http, HttpResponse } from "msw";

const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer());

/**
 * Answers one oRPC procedure (`store/metaSetup`) with `data`, encoded the
 * way the server's RPC handler encodes it, so dates arrive as dates.
 */
export const rpc = (path: string, data: unknown) =>
  http.post(`*/api/rpc/${path}`, () =>
    HttpResponse.json(serializer.serialize(data) as object)
  );

/** Every other procedure: 404, which the flagged panels read as "off". */
export const rpcNotFound = http.post("*/api/rpc/*", () =>
  HttpResponse.json(null, { status: 404 })
);
