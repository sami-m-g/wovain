import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { HangTag } from "@/components/product/hang-tag";
import { AppToaster } from "@/components/toaster";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { priceBreakdown } from "@/lib/pricing";

const EXAMPLE_BASE_COST = 12;

const AuthAside = async () => {
  const t = await getTranslations("Auth");
  const home = await getTranslations("Home");
  const format = await getFormatter();
  const money = (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
  const tag = priceBreakdown(EXAMPLE_BASE_COST);
  return (
    <aside className="bg-muted border-border relative hidden flex-col justify-between gap-12 overflow-hidden border-s p-12 lg:sticky lg:top-0 lg:flex lg:h-svh">
      <div className="flex max-w-md flex-col gap-4">
        <p className="font-display text-display-2 font-semibold">
          {t("asideTitle")}
        </p>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("asideBody")}
        </p>
      </div>
      <HangTag
        className="w-72 rotate-[-3deg] self-center"
        footer={home("tag.campaign")}
        lines={[
          { label: home("tag.price"), value: money(tag.price) },
          { label: home("tag.blank"), value: `− ${money(tag.baseCost)}` },
          {
            emphasis: true,
            label: home("tag.profit"),
            value: money(tag.profit),
          },
        ]}
        subtitle={home("tag.subtitle")}
        title={home("tag.title")}
      />
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
    <div className="bg-background grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
          <Link aria-label={common("homeLabel")} href="/">
            <Logo height={30} variant="seam" />
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
      <AppToaster />
    </div>
  );
};

export default AuthLayout;
