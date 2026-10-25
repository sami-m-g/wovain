import { generateOGImage } from "fumadocs-ui/og";
import { notFound } from "next/navigation";

import { appName, getPageImageUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export const revalidate = false;

export const GET = async (
  _req: Request,
  { params }: RouteContext<"/[lang]/og/docs/[...slug]">
) => {
  const { lang, slug } = await params;
  const page = source.getPage(slug.slice(0, -1), lang);
  if (!page) {
    notFound();
  }

  return generateOGImage({
    description: page.data.description,
    site: appName,
    title: page.data.title,
  });
};

export const generateStaticParams = () =>
  source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }));
