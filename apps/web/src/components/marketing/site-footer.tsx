import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { Logo } from "@/components/brand/logo";
import { ConsentSettingsButton } from "@/components/consent-banner";
import { LocaleSwitcher } from "@/components/locale-switcher";
import Footer from "@/components/shadcn-studio/blocks/footer-component-01/footer-component-01";
import { getContent } from "@/content/load";
import { INTEGRATION_SLUGS, USE_CASE_SLUGS } from "@/content/types";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";

const COPYRIGHT_YEAR = "2026";

const linkClass =
  "text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-sm hover:underline";

type Href = ComponentProps<typeof Link>["href"];

const item = (key: string, href: Href, label: string) => (
  <li key={key}>
    <Link className={linkClass} href={href}>
      {label}
    </Link>
  </li>
);

export const SiteFooter = async () => {
  const t = await getTranslations("Footer");
  const common = await getTranslations("Common");
  const locale = await getLocale();
  const content = await getContent(locale);

  const columns = [
    {
      id: "footer-product",
      links: [
        item("how", { hash: "results", pathname: "/" }, t("howItWorks")),
        item("pricing", "/pricing", t("pricing")),
        item("chatgpt", "/integrations/chatgpt", t("chatgpt")),
        item("sign-up", "/sign-up", t("signUp")),
      ],
      title: t("product"),
    },
    {
      id: "footer-integrations",
      links: INTEGRATION_SLUGS.filter((slug) => slug !== "chatgpt").map(
        (slug) =>
          item(slug, `/integrations/${slug}`, content.integrations[slug].name)
      ),
      title: t("integrations"),
    },
    {
      id: "footer-use-cases",
      links: USE_CASE_SLUGS.map((slug) =>
        item(slug, `/use-cases/${slug}`, content.cases[slug].name)
      ),
      title: t("useCases"),
    },
    {
      id: "footer-resources",
      links: [
        item("guides", "/guides", t("guides")),
        <li key="docs">
          <a className={linkClass} href={ENV.DOCS_URL}>
            {t("docs")}
          </a>
        </li>,
        item("privacy", "/privacy", t("privacy")),
        item("terms", "/terms", t("terms")),
        <li key="consent">
          <ConsentSettingsButton className={linkClass} />
        </li>,
        <li key="contact">
          <a className={linkClass} href={`mailto:${ENV.SUPPORT_EMAIL}`}>
            {t("contact")}
          </a>
        </li>,
      ],
      title: t("resources"),
    },
  ];

  return (
    <Footer
      aside={<LocaleSwitcher />}
      brand={
        <Link aria-label={common("homeLabel")} href="/">
          <Logo height={30} />
        </Link>
      }
      columns={columns}
      copyright={t("copyright", { year: COPYRIGHT_YEAR })}
      tagline={t("tagline")}
    />
  );
};
