import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/seo";

const robots = (): MetadataRoute.Robots => {
  const privatePaths = ["/api/", "/dashboard"];
  for (const locale of routing.locales) {
    if (locale !== routing.defaultLocale) {
      privatePaths.push(`/${locale}/dashboard`);
    }
  }
  return {
    rules: { allow: "/", disallow: privatePaths, userAgent: "*" },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
};

export default robots;
