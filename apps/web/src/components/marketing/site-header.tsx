import { Button } from "@wovain/ui/components/button";
import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/components/brand/wordmark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CtaLink } from "@/components/marketing/cta-link";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";

const SECTIONS = [
  { hash: "how", key: "how" },
  { hash: "autopilot", key: "autopilot" },
  { hash: "chatgpt", key: "chatgpt" },
  { hash: "powered-by", key: "poweredBy" },
] as const;

export const SiteHeader = async () => {
  const t = await getTranslations("Header");
  const common = await getTranslations("Common");

  return (
    <header className="border-border/70 bg-background/90 sticky top-0 z-40 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          aria-label={common("homeLabel")}
          className="me-auto shrink-0 lg:me-6"
          href="/"
        >
          <Wordmark />
        </Link>
        <nav
          aria-label={common("primaryNav")}
          className="me-auto hidden lg:block"
        >
          <ul className="flex items-center gap-1">
            {SECTIONS.map(({ hash, key }) => (
              <li key={hash}>
                <Link
                  className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center px-3 text-sm font-medium"
                  href={{ hash, pathname: "/" }}
                >
                  {t(key)}
                </Link>
              </li>
            ))}
            <li>
              <a
                className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center px-3 text-sm font-medium"
                href={ENV.DOCS_URL}
              >
                {t("docs")}
              </a>
            </li>
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleSwitcher className="hidden sm:flex" />
          <ModeToggle />
          <UserMenu />
          <Button
            className="hidden h-10 px-4 text-sm font-semibold sm:inline-flex"
            nativeButton={false}
            render={<CtaLink cta="header-sign-up" href="/sign-up" />}
          >
            {t("startDrop")}
          </Button>
        </div>
      </div>
    </header>
  );
};
