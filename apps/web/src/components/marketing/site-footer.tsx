import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/components/brand/wordmark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";

const COPYRIGHT_YEAR = "2026";

const linkClass =
  "inline-flex min-h-10 items-center text-sm text-muted-foreground hover:text-foreground hover:underline";

export const SiteFooter = async () => {
  const t = await getTranslations("Footer");
  const header = await getTranslations("Header");
  const common = await getTranslations("Common");

  return (
    <footer className="border-border bg-background border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col items-start gap-4">
          <Link aria-label={common("homeLabel")} href="/">
            <Wordmark />
          </Link>
          <p className="text-muted-foreground max-w-sm text-sm">
            {t("tagline")}
          </p>
          <LocaleSwitcher />
        </div>
        <nav aria-labelledby="footer-product">
          <h2
            className="font-condensed text-muted-foreground text-xs font-bold tracking-widest uppercase"
            id="footer-product"
          >
            {t("product")}
          </h2>
          <ul className="mt-3">
            <li>
              <Link className={linkClass} href={{ hash: "how", pathname: "/" }}>
                {header("how")}
              </Link>
            </li>
            <li>
              <Link
                className={linkClass}
                href={{ hash: "chatgpt", pathname: "/" }}
              >
                {header("chatgpt")}
              </Link>
            </li>
            <li>
              <a className={linkClass} href={ENV.DOCS_URL}>
                {t("docs")}
              </a>
            </li>
            <li>
              <Link className={linkClass} href="/sign-up">
                {header("startDrop")}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="footer-legal">
          <h2
            className="font-condensed text-muted-foreground text-xs font-bold tracking-widest uppercase"
            id="footer-legal"
          >
            {t("legal")}
          </h2>
          <ul className="mt-3">
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
              <a className={linkClass} href="mailto:hello@wovain.com">
                {t("contact")}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-border border-t">
        <p className="text-muted-foreground mx-auto max-w-7xl px-4 py-5 text-xs sm:px-6">
          {t("copyright", { year: COPYRIGHT_YEAR })}
        </p>
      </div>
    </footer>
  );
};
