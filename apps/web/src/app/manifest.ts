import type { MetadataRoute } from "next";

import { PALETTE } from "@/brand/brand";

import messages from "../../messages/en.json";

const manifest = (): MetadataRoute.Manifest => ({
  background_color: PALETTE.light.paper,
  description: messages.Metadata.defaultDescription,
  display: "standalone",
  icons: [
    { sizes: "any", src: "/icon.svg", type: "image/svg+xml" },
    { sizes: "180x180", src: "/apple-icon.png", type: "image/png" },
    { sizes: "192x192", src: "/icon.png", type: "image/png" },
    { sizes: "512x512", src: "/brand/icon-512.png", type: "image/png" },
    { sizes: "1024x1024", src: "/brand/app-icon.svg", type: "image/svg+xml" },
  ],
  name: messages.Metadata.defaultTitle,
  short_name: messages.Metadata.siteName,
  start_url: "/",
  theme_color: PALETTE.light.accent,
});

export default manifest;
