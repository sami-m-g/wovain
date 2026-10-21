import { counters, records } from "./app-schema.ts";

// Every table in wovain's Neon database. Accounts live in WorkOS, so rows
// carry its user id (`sub` in /mcp's tokens) without a local users table.
export const schema = { counters, records };

export { counters, records } from "./app-schema.ts";
