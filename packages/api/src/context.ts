import type { Session } from "@wovain/auth";
import type { Core } from "@wovain/core/core";
import type { Database } from "@wovain/db";
import type { EvlogOrpcContext } from "evlog/orpc";

// `log` is the request logger when the caller runs inside an evlog-instrumented request
export interface Context extends Partial<EvlogOrpcContext> {
  core: Core;
  db: Database;
  // The merchant behind an MCP access token (ChatGPT), which has no session.
  mcpUserId?: string;
  session: Session | null;
}
