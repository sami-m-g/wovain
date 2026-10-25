import { createGetUrl } from "fumadocs-core/source";

export const appName = "Wovain Docs";
export const docsRoute = "/docs";
const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";

export const gitConfig = {
  branch: "main",
  repo: "wovain",
  user: "sami-m-g",
};

const getContentUrl = createGetUrl(docsContentRoute);

interface PageRef {
  locale?: string | undefined;
  slugs: string[];
}

export const getPageMarkdownUrl = (page: PageRef) => {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getContentUrl(segments, page.locale) };
};

const getImageUrl = createGetUrl(docsImageRoute);

export const getPageImageUrl = (page: PageRef) => {
  const segments = [...page.slugs, "image.png"];

  return { segments, url: getImageUrl(segments, page.locale) };
};
