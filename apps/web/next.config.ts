import path from "node:path";

import type { NextConfig } from "next";

const root = path.join(import.meta.dirname, "..", "..");

// The MCP route reads the built cards, the caption font and the ffmpeg binary
// from disk, so they're traced into the function from the monorepo root.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/mcp": [
      "../cards/dist/*.html",
      "../server/assets/**",
      "../../node_modules/.bun/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
    ],
  },
  outputFileTracingRoot: root,
  // ffmpeg-static finds its binary next to its own files.
  serverExternalPackages: ["ffmpeg-static"],
  // Bundled, not external: under `next dev` on Bun the external alias for pg
  // fails to resolve (production builds load either way).
  transpilePackages: ["pg"],
  turbopack: { root },
  typedRoutes: true,
};

export default nextConfig;
