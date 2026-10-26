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
import { INTEGRATION_SLUGS } from "@/content/types";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

type Props = PageProps<"/[locale]/integrations">;

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "integrationsDescription",
    locale,
    path: "/integrations",
    titleKey: "integrationsTitle",
  });
};

const IntegrationsPage = async ({ params }: Props) => {
  const locale = await enterLocale(params);
  const t = await getTranslations("Seo");
  const content = await getContent(locale);
  const crumbs = [
    { name: t("home"), path: "/" },
    { name: t("integrationsTitle"), path: "/integrations" },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs, locale)} />
      <PageHero
        crumbs={<Breadcrumbs items={crumbs} />}
        lead={t("integrationsLead")}
        title={t("integrationsTitle")}
      />
      <div className={`${container} flex flex-col gap-16 pb-24`}>
        <ul className="border-border grid border-t md:grid-cols-2 md:gap-x-10">
          {INTEGRATION_SLUGS.map((slug) => (
            <li className="border-border border-b" key={slug}>
              <RowLink
                body={content.integrations[slug].lead}
                href={`/integrations/${slug}`}
                meta={
                  <span className="text-muted-foreground text-xs">
                    {content.integrations[slug].category}
                  </span>
                }
                title={content.integrations[slug].name}
              />
            </li>
          ))}
        </ul>
      </div>
      <CtaBand />
    </>
  );
};

export default IntegrationsPage;
