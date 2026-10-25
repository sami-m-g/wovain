import { cn } from "@wovain/ui/lib/utils";

import { BRAND_ASSETS, BRAND_NAME } from "@/brand/brand";

/**
 * The logo as the interface uses it: the plain lockup in navigation, the seam
 * lockup for brand moments. `tone="dark"` always uses the version drawn for
 * dark grounds (the app rail); otherwise it follows the theme. The files live
 * in `public/brand/`, so this component never changes with the artwork.
 * Plain `<img>`: the files are small SVGs with nothing to optimise.
 */
export const Logo = ({
  className,
  height = 26,
  variant = "plain",
  tone = "auto",
}: {
  className?: string;
  height?: number;
  variant?: "plain" | "seam";
  tone?: "auto" | "dark";
}) => {
  const asset = variant === "seam" ? BRAND_ASSETS.seam : BRAND_ASSETS.lockup;
  const width = Math.round((asset.width / asset.height) * height);
  if (tone === "dark") {
    return (
      // oxlint-disable-next-line nextjs/no-img-element -- static SVG logo
      <img
        alt={BRAND_NAME}
        className={cn("shrink-0", className)}
        decoding="async"
        height={height}
        src={asset.dark}
        width={width}
      />
    );
  }
  return (
    <span className={cn("inline-flex shrink-0", className)}>
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
    </span>
  );
};
