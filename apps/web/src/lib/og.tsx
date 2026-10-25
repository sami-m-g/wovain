import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { BRAND_ASSETS, PALETTE } from "@/brand/brand";

const OG_SIZE = { height: 630, width: 1200 };
const SEAM_HEIGHT = 57;
const MARK_SIZE = 540;

const { light } = PALETTE;

/** A logo file from `public/brand/` as a data URI the image renderer can draw. */
const brandFile = async (file: string) => {
  const svg = await readFile(path.join(process.cwd(), "public", file));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
};

/**
 * The shared social card, after the brand's OG template: calico ground, the
 * seam lockup, the page's title and line, the mark watermarked on the right
 * and a cochineal selvedge along the bottom.
 */
export const ogImage = async ({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) => {
  const [seam, mark] = await Promise.all([
    brandFile(BRAND_ASSETS.seam.light),
    brandFile(BRAND_ASSETS.mark),
  ]);
  const seamWidth = Math.round(
    (BRAND_ASSETS.seam.width / BRAND_ASSETS.seam.height) * SEAM_HEIGHT
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
      <img alt="" height={SEAM_HEIGHT} src={seam} width={seamWidth} />
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
