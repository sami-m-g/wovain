import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { container } from "@/components/marketing/section";
import {
  Breadcrumbs,
  CtaBand,
  PageHero,
  RowLink,
} from "@/components/marketing/seo-parts";
import { getContent } from "@/content/load";
import { GUIDE_SLUGS } from "@/content/types";
import { routing } from "@/i18n/routing";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

type Props = PageProps<"/[locale]/guides">;

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    descriptionKey: "guidesDescription",
    locale,
    path: "/guides",
    titleKey: "guidesTitle",
  });
};

const GuidesPage = async ({ params }: Props) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("Seo");
  const content = await getContent(locale);
  const crumbs = [
    { name: t("home"), path: "/" },
    { name: t("guidesTitle"), path: "/guides" },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs, locale)} />
      <PageHero
        crumbs={<Breadcrumbs items={crumbs} />}
        lead={t("guidesLead")}
        title={t("guidesTitle")}
      />
      <div className={`${container} pb-24`}>
        <ul className="border-border border-t">
          {GUIDE_SLUGS.map((slug) => (
            <li className="border-border border-b" key={slug}>
              <RowLink
                body={content.guides[slug].description}
                href={`/guides/${slug}`}
                meta={
                  <span className="text-muted-foreground text-xs">
                    {t("readingTime", {
                      minutes: content.guides[slug].readingMinutes,
                    })}
                  </span>
                }
                title={content.guides[slug].title}
              />
            </li>
          ))}
        </ul>
      </div>
      <CtaBand />
    </>
  );
};

export default GuidesPage;
