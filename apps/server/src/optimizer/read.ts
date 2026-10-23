import type { ProviderId } from "../lib/connections.ts";
import { newConversationId } from "../lib/meta-draft.ts";
import { readRows } from "../lib/upstream-rows.ts";
import type { Read } from "../lib/upstream-rows.ts";
import { canReach } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";

// How the optimizer reads a merchant's accounts: one upstream tool call on
// that merchant's own grant, as rows. A provider the merchant hasn't
// connected is `missing` (Meta's check-in mode), a refused or failed call
// `error`. Replies are untrusted data: only named columns are read, and
// nothing from a reply is logged.

export type { Read } from "../lib/upstream-rows.ts";

export type Call = (
  provider: ProviderId,
  tool: string,
  args: Record<string, unknown>
) => Promise<Read>;

// Every Meta Ads MCP call names the advertiser's job and a conversation id.
export const metaArgs = (args: Record<string, unknown>) => ({
  advertiser_job: "assess_and_optimize_performance",
  client_conversation_id: newConversationId(),
  ...args,
});

export const rowsOf = (read: Read) => (read.kind === "rows" ? read.rows : []);

// Builds one merchant's Call; tests pass their own.
export type Reader = (userId: string, count: () => Promise<boolean>) => Call;

// The merchant's reads, counted so quota.ts can cap them. `count` runs before
// each call and returns false once the day's upstream budget is spent.
export const callerFor = (
  upstream: Upstream | undefined,
  userId: string,
  count: () => Promise<boolean>
): Call => {
  const call: Call = async (provider, tool, args) => {
    if (!canReach(upstream, provider)) {
      return { kind: "missing" };
    }
    if (!(await upstream.connected(userId, provider))) {
      return { kind: "missing" };
    }
    if (!(await count())) {
      return { kind: "error" };
    }
    return await readRows(upstream, { args, id: provider, tool, userId });
  };
  return call;
};
