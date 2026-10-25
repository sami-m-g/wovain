import { hasLocale, useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Wordmark } from "@/components/brand/wordmark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const STRIP = [
  "bg-ink-black",
  "bg-ink-yellow",
  "bg-ink-rhodamine",
  "bg-ink-green",
  "bg-white/25",
  "bg-white/25",
] as const;

const AuthAside = () => {
  const t = useTranslations("Auth");
  return (
    <aside className="bg-ink-indigo relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
      <ol aria-hidden="true" className="grid grid-cols-6 gap-1.5">
        {STRIP.map((fill, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- fixed, decorative strip
          <li className={`h-24 ${fill}`} key={`${fill}-${index}`} />
        ))}
      </ol>
      <div className="flex max-w-md flex-col gap-4">
        <p className="font-expanded text-4xl leading-[1.02] font-black tracking-tight">
          {t("asideTitle")}
        </p>
        <p className="text-lg text-white/90">{t("asideBody")}</p>
      </div>
    </aside>
  );
};

const AuthLayout = async ({ children, params }: LayoutProps<"/[locale]">) => {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const common = await getTranslations("Common");
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
          <Link aria-label={common("homeLabel")} href="/">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ModeToggle />
          </div>
        </header>
        <main
          className="flex flex-1 items-center justify-center px-4 py-12 outline-none sm:px-8"
          id="main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      <AuthAside />
    </div>
  );
};

export default AuthLayout;
