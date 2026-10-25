import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();
const withVarlock = varlockNextConfigPlugin();

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default withVarlock(withMDX(config));
