import { GUIDE_SLUGS } from "@/content/types";
import { slugOgImage } from "@/lib/og";

const og = slugOgImage({
  alt: "wovain guide",
  entry: (content, slug) => content.guides[slug],
  fallback: "price-print-on-demand",
  slugs: GUIDE_SLUGS,
});

export const { alt, contentType, generateStaticParams, size } = og;
export default og.Image;
