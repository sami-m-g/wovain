import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";

import { routing } from "@/i18n/routing";

export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

const INKS = ["#14162e", "#f2c230", "#c81e63", "#0d7a51", "#3b4cca", "#3b4cca"];

export const generateImageMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "Metadata",
  });
  return [{ alt: t("ogAlt"), contentType, id: "og", size }];
};

const OpengraphImage = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "Metadata",
  });

  return new ImageResponse(
    <div
      style={{
        background: "#f6f7fb",
        color: "#14162e",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: 72,
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 20 }}>
        <div
          style={{
            background: "#3b4cca",
            display: "flex",
            height: 56,
            position: "relative",
            width: 56,
          }}
        />
        <div style={{ fontSize: 44, fontWeight: 900 }}>{t("siteName")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: 92,
            fontWeight: 900,
            letterSpacing: -3,
            lineHeight: 1,
          }}
        >
          {t("ogTagline")}
        </div>
        <div style={{ color: "#545a78", fontSize: 34 }}>{t("ogSteps")}</div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {INKS.map((ink, index) => (
          <div
            // oxlint-disable-next-line react/no-array-index-key -- fixed, decorative strip
            key={`${ink}-${index}`}
            style={{ background: ink, display: "flex", flex: 1, height: 64 }}
          />
        ))}
      </div>
    </div>,
    size
  );
};

export default OpengraphImage;
