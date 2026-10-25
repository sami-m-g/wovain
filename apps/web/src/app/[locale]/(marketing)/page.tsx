import { Button } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { Check, MessageSquare, MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import type { Ink } from "@/components/brand/swatch";
import { INK_HEX, inkField, Swatch } from "@/components/brand/swatch";
import { JsonLd } from "@/components/json-ld";
import { BriefForm } from "@/components/marketing/brief-form";
import { CopyField } from "@/components/marketing/copy-field";
import { FanDeck } from "@/components/marketing/fan-deck";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localizedUrl, mcpUrl, pageMetadata, siteUrl } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({ locale, path: "/", titleKey: "defaultTitle" });
};

const STEPS = [
  { ink: "yellow", key: "trends" },
  { ink: "rhodamine", key: "designs" },
  { ink: "black", key: "approve" },
  { ink: "green", key: "fourthwall" },
  { ink: "indigo", key: "meta" },
] as const satisfies readonly { ink: Ink; key: string }[];

const PARTNERS = [
  { ink: "green", key: "nebius" },
  { ink: "rhodamine", key: "qloo" },
  { ink: "yellow", key: "tavily" },
  { ink: "black", key: "fourthwall" },
  { ink: "indigo", key: "meta" },
  { ink: "rhodamine", key: "gitlab" },
] as const satisfies readonly { ink: Ink; key: string }[];

const sectionTitle =
  "font-expanded text-3xl leading-[1.05] font-black tracking-tight sm:text-5xl";

const HomePage = async ({ params }: PageProps<"/[locale]">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const meta = await getTranslations("Metadata");
  const common = await getTranslations("Common");

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      logo: new URL("/icon.svg", siteUrl).toString(),
      name: meta("siteName"),
      sameAs: [ENV.DOCS_URL],
      url: localizedUrl("/", locale),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      applicationCategory: "BusinessApplication",
      description: meta("defaultDescription"),
      inLanguage: locale,
      name: meta("siteName"),
      operatingSystem: "Web, ChatGPT",
      url: localizedUrl("/", locale),
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero: the headline, a working brief field and the demo drop as a fan deck */}
      <section
        aria-labelledby="hero-title"
        className="border-border relative overflow-hidden border-b"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-12 pb-10 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:pt-20 lg:pb-16">
          <div className="flex flex-col gap-7">
            <h1
              className="font-expanded text-5xl leading-[0.95] font-black tracking-[-0.03em] text-balance sm:text-7xl xl:text-[5.5rem]"
              id="hero-title"
            >
              {t("heroTitle")}
            </h1>
            <p className="text-muted-foreground max-w-[60ch] text-lg leading-relaxed">
              {t("heroLead")}
            </p>
            <BriefForm />
            <p className="text-muted-foreground text-sm">{t("noCard")}</p>
          </div>
          <FanDeck className="lg:-me-6" />
        </div>
      </section>

      {/* How it works: one strip of inks, one per step */}
      <section
        aria-labelledby="how-title"
        className="border-border scroll-mt-20 border-b"
        id="how"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 className={sectionTitle} id="how-title">
              {t("howTitle")}
            </h2>
            <p className="text-muted-foreground max-w-[60ch] text-lg leading-relaxed">
              {t("howLead")}
            </p>
          </div>
          <ol className="relative mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(({ ink, key }, index) => (
              <li key={key}>
                <Swatch
                  className="h-full"
                  code={`WV ${String(index + 1).padStart(2, "0")} · ${INK_HEX[ink]}`}
                  fieldClassName="min-h-40"
                  ink={ink}
                  name={t(`steps.${key}.name`)}
                >
                  <p className="text-muted-foreground pt-1">
                    {t(`steps.${key}.body`)}
                  </p>
                </Swatch>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Autopilot: the same strip, with the approval chip unlit */}
      <section
        aria-labelledby="autopilot-title"
        className="border-border bg-card scroll-mt-20 border-b"
        id="autopilot"
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:py-28">
          <div className="flex flex-col gap-5">
            <h2 className={sectionTitle} id="autopilot-title">
              {t("autopilotTitle")}
            </h2>
            <p className="text-muted-foreground max-w-[60ch] text-lg leading-relaxed">
              {t("autopilotLead")}
            </p>
          </div>
          <div className="flex flex-col gap-8">
            {(
              [
                { auto: false, label: t("autopilotManual") },
                { auto: true, label: t("autopilotAuto") },
              ] as const
            ).map(({ auto, label }) => (
              <div key={label}>
                <h3 className="font-condensed text-sm font-bold tracking-widest uppercase">
                  {label}
                </h3>
                <ol className="mt-3 grid grid-cols-5 gap-1.5">
                  {STEPS.map(({ ink, key }) => {
                    const ghost = auto && key === "approve";
                    return (
                      <li
                        className={cn(
                          "flex min-h-24 flex-col justify-between p-2 sm:min-h-28 sm:p-3",
                          ghost
                            ? "border-input text-muted-foreground border border-dashed"
                            : inkField[ink]
                        )}
                        key={key}
                      >
                        <span className="font-semi-expanded text-xs leading-tight font-extrabold break-words sm:text-sm">
                          {t(`steps.${key}.name`)}
                        </span>
                        {key === "approve" ? (
                          <span className="text-[0.7rem] leading-tight sm:text-xs">
                            {ghost ? t("autopilotSkip") : t("autopilotStop")}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ChatGPT and the web */}
      <section
        aria-labelledby="chatgpt-title"
        className="border-border scroll-mt-20 border-b"
        id="chatgpt"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <h2 className={cn(sectionTitle, "max-w-3xl")} id="chatgpt-title">
            {t("surfacesTitle")}
          </h2>
          <p className="text-muted-foreground mt-5 max-w-[60ch] text-lg leading-relaxed">
            {t("surfacesLead")}
          </p>
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <article className="border-border bg-card flex flex-col border">
              <header className="border-border flex items-center gap-3 border-b p-5">
                <MessageSquare
                  aria-hidden="true"
                  className="text-primary size-5"
                />
                <h3 className="font-semi-expanded text-xl font-extrabold">
                  {t("chatgptTitle")}
                </h3>
              </header>
              <p className="text-muted-foreground px-5 pt-5">
                {t("chatgptBody")}
              </p>
              <div className="px-5 pt-5">
                <CopyField value={mcpUrl} />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <p className="bg-muted ms-auto max-w-[85%] px-4 py-3 text-sm">
                  {t("chatUser")}
                </p>
                <p className="max-w-[90%] text-sm leading-relaxed">
                  {t("chatAssistant")}
                </p>
                <div className="border-border flex max-w-sm items-stretch border">
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        aria-hidden="true"
                        className="bg-ink-rhodamine size-3 shrink-0"
                      />
                      {t("chatCard")}
                    </span>
                    <span className="flex gap-2" aria-hidden="true">
                      <span className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold">
                        {t("chatApprove")}
                      </span>
                      <span className="border-input border px-3 py-1.5 text-xs font-semibold">
                        {t("chatChange")}
                      </span>
                    </span>
                  </div>
                </div>
                <span className="text-muted-foreground mt-auto text-xs">
                  {common("demoData")}
                </span>
              </div>
            </article>
            <article className="border-border bg-card flex flex-col border">
              <header className="border-border flex items-center gap-3 border-b p-5">
                <MonitorSmartphone
                  aria-hidden="true"
                  className="text-primary size-5"
                />
                <h3 className="font-semi-expanded text-xl font-extrabold">
                  {t("webTitle")}
                </h3>
              </header>
              <p className="text-muted-foreground px-5 pt-5">{t("webBody")}</p>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <ol aria-hidden="true" className="grid grid-cols-6 gap-1">
                  {(
                    [
                      "black",
                      "yellow",
                      "rhodamine",
                      "green",
                      "indigo",
                      "indigo",
                    ] as const
                  ).map((ink, index) => (
                    <li
                      className={cn(
                        "h-10",
                        index < 3
                          ? inkField[ink]
                          : "border-input border border-dashed"
                      )}
                      // oxlint-disable-next-line react/no-array-index-key -- fixed, decorative strip
                      key={`${ink}-${index}`}
                    />
                  ))}
                </ol>
                <span className="font-condensed text-muted-foreground text-xs font-bold tracking-widest uppercase">
                  {t("webStep")}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {(["rhodamine", "indigo"] as const).map((ink, index) => (
                    <div className="border-border border" key={ink}>
                      <div
                        className={cn(
                          "grid aspect-[4/3] place-items-center",
                          inkField[ink]
                        )}
                      >
                        {index === 0 ? (
                          <Check aria-hidden="true" className="size-6" />
                        ) : null}
                      </div>
                      <div className="bg-muted h-2" />
                    </div>
                  ))}
                </div>
                <span className="text-muted-foreground mt-auto text-xs">
                  {common("demoData")}
                </span>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Powered by: the colophon */}
      <section
        aria-labelledby="powered-title"
        className="border-border bg-card scroll-mt-20 border-b"
        id="powered-by"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 className={sectionTitle} id="powered-title">
              {t("poweredTitle")}
            </h2>
            <p className="text-muted-foreground max-w-[60ch] text-lg">
              {t("poweredLead")}
            </p>
          </div>
          <ul className="border-border mt-12 grid border-t sm:grid-cols-2 lg:grid-cols-3">
            {PARTNERS.map(({ ink, key }) => (
              <li
                className="border-border flex items-start gap-4 border-b py-6 sm:pe-6"
                key={key}
              >
                <span
                  aria-hidden="true"
                  className={cn("mt-1 size-5 shrink-0", inkField[ink])}
                />
                <span className="flex flex-col gap-1">
                  <span className="font-semi-expanded text-lg font-extrabold">
                    {t(`partners.${key}.name`)}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {t(`partners.${key}.role`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing call to action, drenched in indigo */}
      <section aria-labelledby="cta-title" className="bg-ink-indigo text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-20 sm:px-6 lg:py-28">
          <h2
            className="font-expanded max-w-4xl text-4xl leading-[1] font-black tracking-tight sm:text-6xl"
            id="cta-title"
          >
            {t("ctaTitle")}
          </h2>
          <p className="max-w-[55ch] text-lg text-white/90">{t("ctaBody")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="text-ink-black h-12 bg-white px-6 text-sm font-semibold hover:bg-white/90"
              nativeButton={false}
              render={<Link href="/sign-up" />}
            >
              {t("ctaButton")}
            </Button>
            <Button
              className="h-12 px-4 text-sm font-semibold text-white underline hover:bg-white/10 hover:text-white"
              nativeButton={false}
              render={<Link href="/login" />}
              variant="ghost"
            >
              {t("ctaSecondary")}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
};

export default HomePage;
