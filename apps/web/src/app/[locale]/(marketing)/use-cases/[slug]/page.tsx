import { Check } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { BriefForm } from "@/components/marketing/brief-form";
import { FaqList, faqJsonLd } from "@/components/marketing/faq-list";
import {
  Breadcrumbs,
  ContentBlock,
  CtaBand,
  PageHero,
  RowLink,
  StepRibbon,
} from "@/components/marketing/seo-parts";
import { getContent } from "@/content/load";
import type { UseCaseSlug } from "@/content/types";
import { USE_CASE_SLUGS } from "@/content/types";
import { routing } from "@/i18n/routing";
import { breadcrumbJsonLd, contentMetadata, localizedUrl } from "@/lib/seo";

type Props = PageProps<"/[locale]/use-cases/[slug]">;

const isSlug = (slug: string): slug is UseCaseSlug =>
  (USE_CASE_SLUGS as readonly string[]).includes(slug);

export const generateStaticParams = () =>
  routing.locales.flatMap((locale) =>
    USE_CASE_SLUGS.map((slug) => ({ locale, slug }))
  );

export const dynamicParams = false;

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale, slug } = await params;
  if (!(hasLocale(routing.locales, locale) && isSlug(slug))) {
    return {};
  }
  const content = await getContent(locale);
  const item = content.cases[slug];
  return contentMetadata({
    description: item.description,
    locale,
    path: `/use-cases/${slug}`,
    title: item.title,
  });
};

const UseCasePage = async ({ params }: Props) => {
  const { locale, slug } = await params;
  if (!(hasLocale(routing.locales, locale) && isSlug(slug))) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("Seo");
  const meta = await getTranslations("Metadata");
  const content = await getContent(locale);
  const item = content.cases[slug];
  const path = `/use-cases/${slug}`;
  const crumbs = [
    { name: t("home"), path: "/" },
    { name: t("useCasesTitle"), path: "/use-cases" },
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
            name: meta("siteName"),
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            operatingSystem: "Web, ChatGPT",
            url: localizedUrl(path, locale),
          },
        ]}
      />
      <PageHero
        crumbs={<Breadcrumbs items={crumbs} />}
        lead={item.lead}
        title={item.title}
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("exampleBrief")}</p>
          <BriefForm defaultValue={item.exampleBrief} id="use-case-brief" />
        </div>
      </PageHero>
      <ContentBlock id="situation" title={t("situation")}>
        <p className="text-muted-foreground max-w-[62ch] text-lg leading-relaxed">
          {item.situation}
        </p>
      </ContentBlock>
      <ContentBlock id="steps" title={t("dropSteps")}>
        <StepRibbon steps={item.steps} />
      </ContentBlock>
      <ContentBlock id="tips" title={t("tips")}>
        <ul className="flex flex-col gap-4">
          {item.tips.map((tip) => (
            <li className="flex items-start gap-3 leading-relaxed" key={tip}>
              <Check
                aria-hidden="true"
                className="text-accent-text mt-1 size-4 shrink-0"
              />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </ContentBlock>
      <ContentBlock id="faq" title={t("faq")}>
        <FaqList items={item.faq} />
      </ContentBlock>
      <ContentBlock id="related" title={t("relatedIntegrations")}>
        <ul className="border-border border-t">
          {item.related.map((integration) => (
            <li className="border-border border-b" key={integration}>
              <RowLink
                body={content.integrations[integration].category}
                href={`/integrations/${integration}`}
                title={content.integrations[integration].name}
              />
            </li>
          ))}
        </ul>
      </ContentBlock>
      <CtaBand brief={item.exampleBrief} />
    </>
  );
};

export default UseCasePage;
