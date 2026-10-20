import { auth } from "../../../lib/server.ts";

// MCP clients look for OAuth metadata at the site root
// (/.well-known/oauth-protected-resource/mcp and
// /.well-known/oauth-authorization-server/api/auth); Better Auth's plugins
// answer those paths when the request reaches its handler, and 404 the rest.
export const GET = async (request: Request) => await auth.handler(request);
