import type { Session } from "@wovain/auth";
import type { Database } from "@wovain/db";
import type { EvlogOrpcContext } from "evlog/orpc";

// `log` is the request logger when the caller runs inside an evlog-instrumented request
export interface Context extends Partial<EvlogOrpcContext> {
  session: Session | null;
  db: Database;
}
