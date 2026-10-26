import { USE_CASE_SLUGS } from "@/content/types";
import { slugOgImage } from "@/lib/og";

const og = slugOgImage({
  alt: "wovain use case",
  entry: (content, slug) => content.cases[slug],
  fallback: "independent-labels",
  slugs: USE_CASE_SLUGS,
});

export const { alt, contentType, generateStaticParams, size } = og;
export default og.Image;
