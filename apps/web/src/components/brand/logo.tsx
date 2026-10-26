import { cn } from "@wovain/ui/lib/utils";

import { BRAND_ASSETS, BRAND_NAME } from "@/brand/brand";
import { ShuttleMark } from "@/components/brand/shuttle-mark";

/**
 * The logo as the interface uses it: the Shuttle lockup. `tone="dark"` always
 * uses the version drawn for dark grounds (the app rail); otherwise it follows
 * the theme. `intro` draws the mark inline and plays its one-time intro (the
 * shuttle darts up its diagonal and the thread draws behind it) beside the
 * wordmark. The files live in `public/brand/`, so this component never
 * changes with the artwork. Plain `<img>`: small SVGs with nothing to optimise.
 */
export const Logo = ({
  className,
  height = 26,
  intro = false,
  tone = "auto",
}: {
  className?: string;
  height?: number;
  intro?: boolean;
  tone?: "auto" | "dark";
}) => {
  const asset = intro ? BRAND_ASSETS.wordmark : BRAND_ASSETS.lockup;
  const width = Math.round(
    (BRAND_ASSETS.lockup.width / BRAND_ASSETS.lockup.height) * height
  );
  const mark = intro ? (
    <ShuttleMark
      className="absolute top-0 left-0"
      label={null}
      size={height}
      state="intro"
    />
  ) : null;
  if (tone === "dark") {
    return (
      <span className={cn("relative inline-flex shrink-0", className)}>
        {/* oxlint-disable-next-line nextjs/no-img-element -- static SVG logo */}
        <img
          alt={BRAND_NAME}
          decoding="async"
          height={height}
          src={asset.dark}
          width={width}
        />
        {mark}
      </span>
    );
  }
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {/* oxlint-disable-next-line nextjs/no-img-element -- static SVG logo */}
      <img
        alt={BRAND_NAME}
        className="dark:hidden"
        decoding="async"
        height={height}
        src={asset.light}
        width={width}
      />
      {/* oxlint-disable-next-line nextjs/no-img-element -- static SVG logo */}
      <img
        alt={BRAND_NAME}
        className="hidden dark:block"
        decoding="async"
        height={height}
        loading="lazy"
        src={asset.dark}
        width={width}
      />
      {mark}
    </span>
  );
};
