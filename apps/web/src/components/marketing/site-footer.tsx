import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ConsentSettingsButton } from "@/components/consent-banner";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getContent } from "@/content/load";
import { INTEGRATION_SLUGS, USE_CASE_SLUGS } from "@/content/types";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";

const COPYRIGHT_YEAR = "2026";

const linkClass =
  "text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-sm hover:underline";

const Column = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) => (
  <nav aria-labelledby={id}>
    <h2 className="text-sm font-medium" id={id}>
      {title}
    </h2>
    <ul className="mt-3 flex flex-col">{children}</ul>
  </nav>
);

export const SiteFooter = async () => {
  const t = await getTranslations("Footer");
  const header = await getTranslations("Header");
  const common = await getTranslations("Common");
  const locale = await getLocale();
  const content = await getContent(locale);

  return (
    <footer className="border-border bg-background border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_repeat(4,1fr)]">
        <div className="flex flex-col items-start gap-4">
          <Link aria-label={common("homeLabel")} href="/">
            <Logo height={30} variant="seam" />
          </Link>
          <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
            {t("tagline")}
          </p>
          <p className="text-muted-foreground text-xs">{t("future")}</p>
          <LocaleSwitcher />
        </div>
        <Column id="footer-product" title={t("product")}>
          <li>
            <Link className={linkClass} href={{ hash: "how", pathname: "/" }}>
              {header("product")}
            </Link>
          </li>
          <li>
            <Link className={linkClass} href="/pricing">
              {header("pricing")}
            </Link>
          </li>
          <li>
            <Link className={linkClass} href="/integrations/chatgpt">
              ChatGPT
            </Link>
          </li>
          <li>
            <Link className={linkClass} href="/sign-up" prefetch={false}>
              {header("startDrop")}
            </Link>
          </li>
        </Column>
        <Column id="footer-integrations" title={t("integrations")}>
          {INTEGRATION_SLUGS.filter((slug) => slug !== "chatgpt").map(
            (slug) => (
              <li key={slug}>
                <Link className={linkClass} href={`/integrations/${slug}`}>
                  {content.integrations[slug].name}
                </Link>
              </li>
            )
          )}
        </Column>
        <Column id="footer-use-cases" title={t("useCases")}>
          {USE_CASE_SLUGS.map((slug) => (
            <li key={slug}>
              <Link className={linkClass} href={`/use-cases/${slug}`}>
                {content.cases[slug].name}
              </Link>
            </li>
          ))}
        </Column>
        <Column id="footer-resources" title={t("resources")}>
          <li>
            <Link className={linkClass} href="/guides">
              {t("guides")}
            </Link>
          </li>
          <li>
            <a className={linkClass} href={ENV.DOCS_URL}>
              {t("docs")}
            </a>
          </li>
          <li>
            <Link className={linkClass} href="/privacy">
              {t("privacy")}
            </Link>
          </li>
          <li>
            <Link className={linkClass} href="/terms">
              {t("terms")}
            </Link>
          </li>
          <li>
            <ConsentSettingsButton className={linkClass} />
          </li>
          <li>
            <a className={linkClass} href="mailto:hello@wovain.com">
              {t("contact")}
            </a>
          </li>
        </Column>
      </div>
      <div className="border-border border-t">
        <p className="text-muted-foreground mx-auto max-w-6xl px-4 py-5 text-xs sm:px-6">
          {t("copyright", { year: COPYRIGHT_YEAR })}
        </p>
      </div>
    </footer>
  );
};
