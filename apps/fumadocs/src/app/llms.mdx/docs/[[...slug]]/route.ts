import { notFound } from "next/navigation";

import { getPageMarkdownUrl } from "@/lib/shared";
import { docsLlms, source } from "@/lib/source";

export const revalidate = false;

export const GET = async (
  _req: Request,
  { params }: RouteContext<"/llms.mdx/docs/[[...slug]]">
) => {
  const { slug } = await params;
  const page = source.getPage(slug?.slice(0, -1));
  if (!page) {
    notFound();
  }

  return new Response(await docsLlms.page(page), {
    headers: {
      "Content-Type": "text/markdown",
    },
  });
};

export const generateStaticParams = () =>
  source.getPages().map((page) => ({
    slug: getPageMarkdownUrl(page).segments,
  }));
