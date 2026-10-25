import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { localizedUrl } from "@/lib/seo";

const PUBLIC_PATHS = ["/", "/sign-up", "/login", "/privacy", "/terms"] as const;
const LAST_MODIFIED = new Date("2026-10-25T00:00:00.000Z");

const sitemap = (): MetadataRoute.Sitemap =>
  PUBLIC_PATHS.map((path) => {
    const languages: Record<string, string> = {};
    for (const locale of routing.locales) {
      languages[locale] = localizedUrl(path, locale);
    }
    return {
      alternates: { languages },
      changeFrequency: path === "/" ? "weekly" : "monthly",
      lastModified: LAST_MODIFIED,
      priority: path === "/" ? 1 : 0.5,
      url: localizedUrl(path, routing.defaultLocale),
    };
  });

export default sitemap;
