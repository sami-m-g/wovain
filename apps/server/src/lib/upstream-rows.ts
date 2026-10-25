import { reportRows } from "./report-rows.ts";
import type { Row } from "./report-rows.ts";
import type { Upstream, UpstreamRequest } from "./upstream.ts";

// One upstream call on the merchant's grant, as report rows. No grant (or a
// refused one) is `missing`; an error reply or a failed call is `error`, and
// its reason isn't kept, since it may echo the merchant's data.

export type Read =
  | { kind: "rows"; rows: Row[] }
  | { kind: "missing" }
  | { kind: "error" };

export const readRows = async (
  upstream: Upstream | undefined,
  request: UpstreamRequest
): Promise<Read> => {
  try {
    const outcome = await upstream?.call(request);
    if (outcome === undefined || outcome.kind === "connect") {
      return { kind: "missing" };
    }
    return outcome.result.isError === true
      ? { kind: "error" }
      : { kind: "rows", rows: reportRows(outcome.result) };
  } catch {
    return { kind: "error" };
  }
};
