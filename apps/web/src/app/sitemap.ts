import type { MetadataRoute } from "next";

import {
  GUIDE_SLUGS,
  INTEGRATION_SLUGS,
  USE_CASE_SLUGS,
} from "@/content/types";
import { routing } from "@/i18n/routing";
import { alternatesFor } from "@/lib/seo";

const LAST_MODIFIED = new Date("2026-10-25T00:00:00.000Z");

const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/pricing", priority: 0.9 },
  { path: "/integrations", priority: 0.8 },
  ...INTEGRATION_SLUGS.map((slug) => ({
    path: `/integrations/${slug}`,
    priority: 0.7,
  })),
  { path: "/use-cases", priority: 0.8 },
  ...USE_CASE_SLUGS.map((slug) => ({
    path: `/use-cases/${slug}`,
    priority: 0.7,
  })),
  { path: "/guides", priority: 0.7 },
  ...GUIDE_SLUGS.map((slug) => ({ path: `/guides/${slug}`, priority: 0.6 })),
  { path: "/sign-up", priority: 0.5 },
  { path: "/login", priority: 0.3 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

/** Every public page in every locale, each with its hreflang alternates. */
const sitemap = (): MetadataRoute.Sitemap =>
  PAGES.flatMap(({ path, priority }) =>
    routing.locales.map((locale) => {
      const { canonical, languages } = alternatesFor(path, locale);
      return {
        alternates: { languages },
        changeFrequency:
          path === "/" ? ("weekly" as const) : ("monthly" as const),
        lastModified: LAST_MODIFIED,
        priority,
        url: canonical,
      };
    })
  );

export default sitemap;
