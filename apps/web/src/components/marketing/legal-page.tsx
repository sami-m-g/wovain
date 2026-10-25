import { getFormatter, getTranslations } from "next-intl/server";

const LAST_UPDATED = new Date("2026-10-25T00:00:00.000Z");

const DOCS = {
  privacy: {
    intro: "privacy.intro",
    sections: [
      ["privacy.collectTitle", "privacy.collectBody"],
      ["privacy.analyticsTitle", "privacy.analyticsBody"],
      ["privacy.connectionsTitle", "privacy.connectionsBody"],
      ["privacy.processorsTitle", "privacy.processorsBody"],
      ["privacy.deleteTitle", "privacy.deleteBody"],
    ],
    title: "privacy.title",
  },
  terms: {
    intro: "terms.intro",
    sections: [
      ["terms.useTitle", "terms.useBody"],
      ["terms.contentTitle", "terms.contentBody"],
      ["terms.spendTitle", "terms.spendBody"],
      ["terms.contactTitle", "terms.contactBody"],
    ],
    title: "terms.title",
  },
} as const;

export const LegalPage = async ({ doc }: { doc: keyof typeof DOCS }) => {
  const t = await getTranslations("Legal");
  const format = await getFormatter();
  const { title, intro, sections } = DOCS[doc];

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="font-expanded text-4xl font-black tracking-tight sm:text-6xl">
        {t(title)}
      </h1>
      <p className="font-condensed text-muted-foreground mt-4 text-xs font-semibold tracking-widest uppercase">
        {t("updated", {
          date: format.dateTime(LAST_UPDATED, { dateStyle: "long" }),
        })}
      </p>
      <p className="mt-8 text-lg leading-relaxed">{t(intro)}</p>
      {sections.map(([heading, body]) => (
        <section className="mt-10" key={heading}>
          <h2 className="font-semi-expanded text-2xl font-extrabold">
            {t(heading)}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-[65ch] leading-relaxed">
            {t(body)}
          </p>
        </section>
      ))}
    </article>
  );
};
