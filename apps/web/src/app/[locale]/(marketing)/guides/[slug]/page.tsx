import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { FaqList, faqJsonLd } from "@/components/marketing/faq-list";
import { PriceTable } from "@/components/marketing/price-table";
import { container } from "@/components/marketing/section";
import { Breadcrumbs, CtaBand } from "@/components/marketing/seo-parts";
import { getContent } from "@/content/load";
import type { GuideSlug } from "@/content/types";
import { GUIDE_SLUGS } from "@/content/types";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import {
  breadcrumbJsonLd,
  contentMetadata,
  localizedUrl,
  siteUrl,
} from "@/lib/seo";

type Props = PageProps<"/[locale]/guides/[slug]">;

const isSlug = (slug: string): slug is GuideSlug =>
  (GUIDE_SLUGS as readonly string[]).includes(slug);

export const generateStaticParams = () =>
  routing.locales.flatMap((locale) =>
    GUIDE_SLUGS.map((slug) => ({ locale, slug }))
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
  const guide = content.guides[slug];
  return contentMetadata({
    description: guide.description,
    locale,
    path: `/guides/${slug}`,
    title: guide.title,
    type: "article",
  });
};

const sectionId = (index: number) => `section-${index + 1}`;

const GuidePage = async ({ params }: Props) => {
  const { slug } = await params;
  const locale = await enterLocale(params);
  if (!isSlug(slug)) {
    notFound();
  }
  const t = await getTranslations("Seo");
  const meta = await getTranslations("Metadata");
  const format = await getFormatter();
  const content = await getContent(locale);
  const guide = content.guides[slug];
  const path = `/guides/${slug}`;
  const crumbs = [
    { name: t("home"), path: "/" },
    { name: t("guidesTitle"), path: "/guides" },
    { name: guide.title, path },
  ];
  const published = new Date(`${guide.published}T00:00:00Z`);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs, locale),
          faqJsonLd(guide.faq),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            author: {
              "@type": "Organization",
              name: meta("siteName"),
              url: siteUrl.toString(),
            },
            datePublished: guide.published,
            description: guide.description,
            headline: guide.title,
            inLanguage: locale,
            mainEntityOfPage: localizedUrl(path, locale),
            publisher: { "@type": "Organization", name: meta("siteName") },
          },
        ]}
      />
      <article className="pt-10 pb-20 sm:pt-14">
        <div className={container}>
          <header className="flex max-w-3xl flex-col gap-6">
            <Breadcrumbs items={crumbs} />
            <h1 className="font-display text-display-2 font-semibold text-balance">
              {guide.title}
            </h1>
            <p className="text-muted-foreground text-xl leading-relaxed">
              {guide.lead}
            </p>
            <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <time dateTime={guide.published}>
                {t("published", {
                  date: format.dateTime(published, {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }),
                })}
              </time>
              <span>{t("readingTime", { minutes: guide.readingMinutes })}</span>
            </p>
          </header>
          <div className="mt-14 grid gap-12 lg:grid-cols-[14rem_1fr] lg:gap-16">
            <nav
              aria-labelledby="toc-title"
              className="lg:sticky lg:top-24 lg:self-start"
            >
              <h2 className="text-sm font-medium" id="toc-title">
                {t("onThisPage")}
              </h2>
              <ol className="border-border mt-3 flex flex-col border-s">
                {guide.sections.map((section, index) => (
                  <li key={section.heading}>
                    <a
                      className="text-muted-foreground hover:text-foreground hover:border-foreground -ms-px block border-s border-transparent py-1.5 ps-4 text-sm leading-snug"
                      href={`#${sectionId(index)}`}
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="flex max-w-[68ch] flex-col gap-12">
              {guide.sections.map((section, index) => (
                <section
                  aria-labelledby={`${sectionId(index)}-title`}
                  className="flex scroll-mt-24 flex-col gap-4"
                  id={sectionId(index)}
                  key={section.heading}
                >
                  <h2
                    className="font-display text-display-3 font-semibold"
                    id={`${sectionId(index)}-title`}
                  >
                    {section.heading}
                  </h2>
                  {section.paragraphs.map((paragraph) => (
                    <p
                      className="text-[1.0625rem] leading-[1.7]"
                      key={paragraph}
                    >
                      {paragraph}
                    </p>
                  ))}
                  {section.list ? (
                    <ul className="marker:text-muted-foreground flex list-disc flex-col gap-2 ps-5 text-[1.0625rem] leading-[1.6]">
                      {section.list.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {slug === "price-print-on-demand-merch" && index === 2 ? (
                    <PriceTable caption={t("priceTable")} />
                  ) : null}
                </section>
              ))}
              <section
                aria-labelledby="faq-title"
                className="flex flex-col gap-4"
              >
                <h2
                  className="font-display text-display-3 font-semibold"
                  id="faq-title"
                >
                  {t("faq")}
                </h2>
                <FaqList items={guide.faq} />
              </section>
            </div>
          </div>
        </div>
      </article>
      <CtaBand />
    </>
  );
};

export default GuidePage;
