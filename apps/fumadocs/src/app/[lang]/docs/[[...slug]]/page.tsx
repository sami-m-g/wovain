import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getMDXComponents } from "@/components/mdx";
import { i18n } from "@/lib/i18n";
import { getPageImageUrl, getPageMarkdownUrl, gitConfig } from "@/lib/shared";
import { source } from "@/lib/source";

const Page = async (props: PageProps<"/[lang]/docs/[[...slug]]">) => {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) {
    notFound();
  }

  const MdxContent = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/fumadocs/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MdxContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
};

export default Page;

export const generateStaticParams = () => source.generateParams();

export const generateMetadata = async (
  props: PageProps<"/[lang]/docs/[[...slug]]">
): Promise<Metadata> => {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) {
    notFound();
  }

  const languages: Record<string, string> = {};
  for (const lang of i18n.languages) {
    const localized = source.getPage(params.slug, lang);
    if (localized) {
      languages[lang] = localized.url;
    }
  }
  languages["x-default"] = languages[i18n.defaultLanguage] ?? page.url;

  return {
    alternates: { canonical: page.url, languages },
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
    title: page.data.title,
  };
};
