import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();
const withVarlock = varlockNextConfigPlugin();

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // The seller guide became the user guide's "Creating a drop" page.
  redirects: () =>
    Promise.resolve([
      {
        destination: "/docs/creating-a-drop",
        permanent: true,
        source: "/docs/seller-guide",
      },
      {
        destination: "/:lang/docs/creating-a-drop",
        permanent: true,
        source: "/:lang(fr|es)/docs/seller-guide",
      },
    ]),
};

export default withVarlock(withMDX(config));
