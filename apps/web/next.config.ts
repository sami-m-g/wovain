import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withVarlock = varlockNextConfigPlugin();

const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: "./messages/en.json",
  },
  requestConfig: "./src/i18n/request.ts",
});

// PostHog through our own domain (posthog.com/docs/advanced/proxy/nextjs),
// so ad blockers don't drop it: /ingest goes to the ingestion host, and its
// static and array assets to the matching assets host.
const posthogHost =
  process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://us.i.posthog.com";
const posthogAssets = posthogHost.replace(
  ".i.posthog.com",
  "-assets.i.posthog.com"
);

// SEO pages that were renamed or removed when wovain moved from creator merch
// to independent labels: each old URL (and its fr/es copy) goes to its closest
// page, permanently.
const MOVED_PAGES = [
  ["/integrations/qloo", "/integrations"],
  ["/integrations/tavily", "/integrations"],
  ["/integrations/nebius", "/integrations"],
  ["/use-cases/creator-merch", "/use-cases/independent-labels"],
  ["/use-cases/youtube-merch", "/use-cases"],
  ["/use-cases/twitch-merch", "/use-cases"],
  ["/use-cases/band-merch", "/use-cases"],
  ["/guides/price-print-on-demand-merch", "/guides/price-print-on-demand"],
  ["/guides/launch-a-merch-drop", "/guides/launch-a-capsule-drop"],
] as const;

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  output: "standalone",
  // The country lookup (src/lib/geo.ts, used by the proxy and /api/visitor)
  // reads geoip-country's data files from its own folder at runtime, so the
  // package stays external and its data ships in the standalone output.
  outputFileTracingIncludes: {
    "/api/visitor": ["./node_modules/geoip-country/data/*.dat"],
  },
  reactCompiler: true,
  redirects: () =>
    Promise.resolve(
      MOVED_PAGES.flatMap(([source, destination]) => [
        { destination, permanent: true, source },
        {
          destination: `/:locale${destination}`,
          permanent: true,
          source: `/:locale(fr|es)${source}`,
        },
      ])
    ),
  rewrites: () => [
    {
      destination: `${posthogAssets}/static/:path*`,
      source: "/ingest/static/:path*",
    },
    {
      destination: `${posthogAssets}/array/:path*`,
      source: "/ingest/array/:path*",
    },
    { destination: `${posthogHost}/:path*`, source: "/ingest/:path*" },
  ],
  serverExternalPackages: ["geoip-country"],
  // PostHog's API paths end in a slash; a redirect would drop the request.
  skipTrailingSlashRedirect: true,
  typedRoutes: true,
};

export default withVarlock(withNextIntl(nextConfig));
