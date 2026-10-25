import type { MetadataRoute } from "next";

import messages from "../../messages/en.json";

const manifest = (): MetadataRoute.Manifest => ({
  background_color: "#f6f7fb",
  description: messages.Metadata.defaultDescription,
  display: "standalone",
  icons: [
    { sizes: "any", src: "/icon.svg", type: "image/svg+xml" },
    { sizes: "180x180", src: "/apple-icon", type: "image/png" },
  ],
  name: messages.Metadata.defaultTitle,
  short_name: messages.Metadata.siteName,
  start_url: "/",
  theme_color: "#3b4cca",
});

export default manifest;
