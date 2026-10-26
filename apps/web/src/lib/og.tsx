import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import { z } from "zod";

import { BRAND_ASSETS, PALETTE } from "@/brand/brand";
import { getContent } from "@/content/load";
import type { SiteContent } from "@/content/types";
import { toLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export const OG_SIZE = { height: 630, width: 1200 };
const LOCKUP_HEIGHT = 60;
const MARK_SIZE = 540;

const { light } = PALETTE;

/** A logo file from `public/brand/` as a data URI the image renderer can draw. */
const brandFile = async (file: string) => {
  const svg = await readFile(path.join(process.cwd(), "public", file));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
};

/**
 * The shared social card, after the brand's OG template: calico ground, the
 * Shuttle lockup, the page's title and line, the mark watermarked on the right
 * and a cochineal selvedge along the bottom.
 */
export const ogImage = async ({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) => {
  const [lockup, mark] = await Promise.all([
    brandFile(BRAND_ASSETS.lockup.light),
    brandFile(BRAND_ASSETS.mark),
  ]);
  const lockupWidth = Math.round(
    (BRAND_ASSETS.lockup.width / BRAND_ASSETS.lockup.height) * LOCKUP_HEIGHT
  );
  return new ImageResponse(
    <div
      style={{
        background: light.paper,
        color: light.ink,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "80px 80px 96px",
        position: "relative",
        width: "100%",
      }}
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- next/og renders plain img */}
      <img
        alt=""
        height={MARK_SIZE}
        src={mark}
        style={{ opacity: 0.1, position: "absolute", right: -40, top: 40 }}
        width={MARK_SIZE}
      />
      {/* oxlint-disable-next-line nextjs/no-img-element -- next/og renders plain img */}
      <img alt="" height={LOCKUP_HEIGHT} src={lockup} width={lockupWidth} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 900,
        }}
      >
        <div
          style={{
            fontSize: title.length > 48 ? 60 : 74,
            fontWeight: 700,
            letterSpacing: -2.5,
            lineHeight: 1.04,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 28, lineHeight: 1.35, opacity: 0.72 }}>
          {subtitle}
        </div>
      </div>
      <div
        style={{
          background: light.accent,
          bottom: 0,
          height: 14,
          left: 0,
          position: "absolute",
          width: "100%",
        }}
      />
    </div>,
    OG_SIZE
  );
};

/**
 * The exports of a `[slug]/opengraph-image.tsx`: one card per locale and
 * slug, with the content entry's title and lead. Unknown slugs fall back.
 */
export const slugOgImage = <const Slug extends string>({
  alt,
  slugs,
  fallback,
  entry,
}: {
  alt: string;
  slugs: readonly [Slug, ...Slug[]];
  fallback: Slug;
  entry: (content: SiteContent, slug: Slug) => { title: string; lead: string };
}) => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const slugSchema = z.enum(slugs).catch(fallback);
  return {
    Image: async ({
      params,
    }: {
      params: Promise<{ locale: string; slug: string }>;
    }) => {
      const { locale, slug } = await params;
      const content = await getContent(toLocale(locale));
      const { title, lead } = entry(content, slugSchema.parse(slug));
      return ogImage({ subtitle: lead, title });
    },
    alt,
    contentType: "image/png",
    generateStaticParams: () =>
      routing.locales.flatMap((locale) =>
        slugs.map((slug) => ({ locale, slug }))
      ),
    size: OG_SIZE,
  };
};
