import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/services";

// RFC 9728 metadata for /api/mcp: MCP clients read it to find wovain's
// authorization server. Better Auth's MCP plugin answers it.
export const { GET } = toNextJsHandler(auth);
