import { inngestHandler } from "@/services";

// Inngest calls this route to run each step of a durable run, and to sync
// the app's functions (docs/adr/0001-durable-runs.md). Its requests are
// signed with INNGEST_SIGNING_KEY, which the handler checks.
export const { GET, POST, PUT } = inngestHandler;
