import { INTEGRATION_SLUGS } from "@/content/types";
import { slugOgImage } from "@/lib/og";

const og = slugOgImage({
  alt: "wovain integration",
  entry: (content, slug) => content.integrations[slug],
  fallback: "fourthwall",
  slugs: INTEGRATION_SLUGS,
});

export const { alt, contentType, generateStaticParams, size } = og;
export default og.Image;
