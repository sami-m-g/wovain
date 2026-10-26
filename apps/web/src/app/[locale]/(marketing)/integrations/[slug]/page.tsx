import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { FaqList, faqJsonLd } from "@/components/marketing/faq-list";
import {
  Breadcrumbs,
  ContentBlock,
  CtaBand,
  PageHero,
  RowLink,
  StepRibbon,
} from "@/components/marketing/seo-parts";
import { HangTag } from "@/components/product/hang-tag";
import { getContent } from "@/content/load";
import type { IntegrationSlug } from "@/content/types";
import { INTEGRATION_SLUGS } from "@/content/types";
import { ENV } from "@/env.server";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { breadcrumbJsonLd, contentMetadata, localizedUrl } from "@/lib/seo";

type Props = PageProps<"/[locale]/integrations/[slug]">;

const isSlug = (slug: string): slug is IntegrationSlug =>
  (INTEGRATION_SLUGS as readonly string[]).includes(slug);

export const generateStaticParams = () =>
  routing.locales.flatMap((locale) =>
    INTEGRATION_SLUGS.map((slug) => ({ locale, slug }))
  );

export const dynamicParams = false;

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { slug } = await params;
  const locale = await requireLocale(params);
  if (!isSlug(slug)) {
    return {};
  }
  const content = await getContent(locale);
  const item = content.integrations[slug];
  return contentMetadata({
    description: item.description,
    locale,
    path: `/integrations/${slug}`,
    title: item.title,
  });
};

const IntegrationPage = async ({ params }: Props) => {
  const { slug } = await params;
  const locale = await enterLocale(params);
  if (!isSlug(slug)) {
    notFound();
  }
  const t = await getTranslations("Seo");
  const home = await getTranslations("Home");
  const content = await getContent(locale);
  const item = content.integrations[slug];
  const path = `/integrations/${slug}`;
  const crumbs = [
    { name: t("home"), path: "/" },
    { name: t("integrationsTitle"), path: "/integrations" },
    { name: item.name, path },
  ];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs, locale),
          faqJsonLd(item.faq),
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            applicationCategory: "BusinessApplication",
            description: item.description,
            inLanguage: locale,
            name: `wovain + ${item.name}`,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            operatingSystem: "Web, ChatGPT",
            url: localizedUrl(path, locale),
          },
        ]}
      />
      <PageHero
        aside={
          <HangTag
            className="mx-auto w-full max-w-72 rotate-[2deg] lg:mt-10"
            footer={
              <a
                className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                href={new URL(item.docsPath, ENV.DOCS_URL).toString()}
              >
                {t("docs")}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            }
            lines={[
              { label: t("category"), value: item.category },
              {
                label: t("connection"),
                value: home(`connection.${item.connection}`),
              },
            ]}
            subtitle={item.setup}
            title={item.name}
          />
        }
        crumbs={<Breadcrumbs items={crumbs} />}
        lead={item.lead}
        title={item.title}
      />
      <ContentBlock id="steps" title={t("steps")}>
        <StepRibbon steps={item.steps} />
      </ContentBlock>
      <ContentBlock id="data" title={t("data")}>
        <p className="text-muted-foreground max-w-[62ch] text-lg leading-relaxed">
          {item.data}
        </p>
      </ContentBlock>
      <ContentBlock id="faq" title={t("faq")}>
        <FaqList items={item.faq} />
      </ContentBlock>
      <ContentBlock id="related" title={t("relatedUseCases")}>
        <ul className="border-border border-t">
          {item.related.map((caseSlug) => (
            <li className="border-border border-b" key={caseSlug}>
              <RowLink
                body={content.cases[caseSlug].lead}
                href={`/use-cases/${caseSlug}`}
                title={content.cases[caseSlug].name}
              />
            </li>
          ))}
        </ul>
      </ContentBlock>
      <CtaBand />
    </>
  );
};

export default IntegrationPage;
