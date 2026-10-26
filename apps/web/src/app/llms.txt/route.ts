import { getContent } from "@/content/load";
import {
  GUIDE_SLUGS,
  INTEGRATION_SLUGS,
  USE_CASE_SLUGS,
} from "@/content/types";
import { ENV } from "@/env.server";
import { localizedUrl, mcpUrl } from "@/lib/seo";

export const dynamic = "force-static";

const link = (title: string, path: string, note: string) =>
  `- [${title}](${localizedUrl(path, "en")}): ${note}`;

/** /llms.txt: what wovain is and where its pages live, for language models. */
export const GET = async () => {
  const content = await getContent("en");
  const body = [
    "# wovain",
    "",
    "> wovain is print-on-demand for independent designers and small labels. You describe a drop; wovain researches it, drafts the graphics for your approval, lists the pieces on your Fourthwall shop priced to clear at least $10 profit and a 30% margin, and builds a Meta ad campaign created paused. It works on the web and as an app in ChatGPT.",
    "",
    `- ChatGPT app (MCP server): ${mcpUrl}`,
    `- Documentation: ${ENV.DOCS_URL}`,
    "",
    "## Integrations",
    ...INTEGRATION_SLUGS.map((slug) =>
      link(
        content.integrations[slug].name,
        `/integrations/${slug}`,
        content.integrations[slug].description
      )
    ),
    "",
    "## Use cases",
    ...USE_CASE_SLUGS.map((slug) =>
      link(
        content.cases[slug].name,
        `/use-cases/${slug}`,
        content.cases[slug].description
      )
    ),
    "",
    "## Guides",
    ...GUIDE_SLUGS.map((slug) =>
      link(
        content.guides[slug].title,
        `/guides/${slug}`,
        content.guides[slug].description
      )
    ),
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
