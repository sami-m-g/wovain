import path from "node:path";

import type { NextConfig } from "next";

const root = path.join(import.meta.dirname, "..", "..");

// The MCP route reads the built widgets from disk, so they're traced into the
// function from the monorepo root.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/mcp": ["../widgets/dist/*.html"],
  },
  outputFileTracingRoot: root,
  turbopack: { root },
  typedRoutes: true,
};

export default nextConfig;
