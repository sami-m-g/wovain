import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { Menu } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CtaLink } from "@/components/marketing/cta-link";
import { ModeToggle } from "@/components/mode-toggle";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";

const LINKS = [
  { href: { hash: "how-it-works", pathname: "/" }, key: "product" },
  { href: { pathname: "/integrations" }, key: "integrations" },
  { href: { pathname: "/guides" }, key: "guides" },
  { href: { pathname: "/pricing" }, key: "pricing" },
] as const;

const linkClass =
  "text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors";

export const SiteHeader = async () => {
  const t = await getTranslations("Header");
  const common = await getTranslations("Common");

  return (
    <header className="border-border bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          aria-label={common("homeLabel")}
          className="me-auto shrink-0 lg:me-4"
          href="/"
        >
          <Logo intro />
        </Link>
        <nav
          aria-label={common("primaryNav")}
          className="me-auto hidden lg:block"
        >
          <ul className="flex items-center gap-0.5">
            {LINKS.map(({ href, key }) => (
              <li key={key}>
                <Link className={linkClass} href={href}>
                  {t(key)}
                </Link>
              </li>
            ))}
            <li>
              <a className={linkClass} href={ENV.DOCS_URL}>
                {t("docs")}
              </a>
            </li>
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher className="hidden sm:flex" />
          <ModeToggle />
          <Link
            className={buttonVariants({ variant: "ghost" })}
            href="/login"
            prefetch={false}
          >
            {common("signIn")}
          </Link>
          <CtaLink
            cta="header-sign-up"
            className={cn(buttonVariants(), "hidden sm:inline-flex")}
            href="/sign-up"
            prefetch={false}
          >
            {t("startDrop")}
          </CtaLink>
          <details className="group relative lg:hidden">
            <summary
              aria-label={t("menu")}
              className="border-input hover:bg-muted grid size-10 cursor-pointer list-none place-items-center rounded-lg border [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden="true" className="size-4" />
            </summary>
            <nav
              aria-label={t("menu")}
              className="border-border bg-popover shadow-floating absolute end-0 top-12 z-50 flex w-64 flex-col gap-1 rounded-xl border p-2"
            >
              {LINKS.map(({ href, key }) => (
                <Link className={linkClass} href={href} key={key}>
                  {t(key)}
                </Link>
              ))}
              <a className={linkClass} href={ENV.DOCS_URL}>
                {t("docs")}
              </a>
              <div className="border-border mt-1 flex flex-col gap-2 border-t p-2 pt-3">
                <LocaleSwitcher className="sm:hidden" />
                <Link
                  className={cn(buttonVariants(), "h-10 rounded-lg")}
                  href="/sign-up"
                  prefetch={false}
                >
                  {t("startDrop")}
                </Link>
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
};
