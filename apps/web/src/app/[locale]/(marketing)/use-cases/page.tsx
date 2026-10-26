import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { JsonLd } from "@/components/json-ld";
import { container } from "@/components/marketing/section";
import {
  Breadcrumbs,
  CtaBand,
  PageHero,
  RowLink,
} from "@/components/marketing/seo-parts";
import { getContent } from "@/content/load";
import { USE_CASE_SLUGS } from "@/content/types";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

type Props = PageProps<"/[locale]/use-cases">;

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "useCasesDescription",
    locale,
    path: "/use-cases",
    titleKey: "useCasesTitle",
  });
};

const UseCasesPage = async ({ params }: Props) => {
  const locale = await enterLocale(params);
  const t = await getTranslations("Seo");
  const content = await getContent(locale);
  const crumbs = [
    { name: t("home"), path: "/" },
    { name: t("useCasesTitle"), path: "/use-cases" },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs, locale)} />
      <PageHero
        crumbs={<Breadcrumbs items={crumbs} />}
        lead={t("useCasesLead")}
        title={t("useCasesTitle")}
      />
      <div className={`${container} pb-24`}>
        <ul className="border-border grid border-t md:grid-cols-2 md:gap-x-10">
          {USE_CASE_SLUGS.map((slug) => (
            <li className="border-border border-b" key={slug}>
              <RowLink
                body={content.cases[slug].lead}
                href={`/use-cases/${slug}`}
                meta={
                  <span className="text-muted-foreground text-xs italic">
                    “{content.cases[slug].exampleBrief}”
                  </span>
                }
                title={content.cases[slug].name}
              />
            </li>
          ))}
        </ul>
      </div>
      <CtaBand />
    </>
  );
};

export default UseCasesPage;
