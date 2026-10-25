import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { HangTag } from "@/components/product/hang-tag";
import { Link } from "@/i18n/navigation";

const NotFoundContent = () => {
  const t = useTranslations("NotFound");
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_16rem]">
      <div>
        <h1 className="font-display text-display-2 font-semibold">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-5 text-lg">{t("body")}</p>
        <Link
          className={cn(buttonVariants(), "mt-8 h-11 rounded-xl px-5")}
          href="/"
        >
          {t("home")}
        </Link>
      </div>
      <HangTag
        className="mx-auto w-56 rotate-3"
        lines={[]}
        subtitle={t("body")}
        title="404"
      />
    </div>
  );
};

const NotFound = () => (
  <div className="flex min-h-svh flex-col">
    <SiteHeader />
    <main className="flex-1 outline-none" id="main" tabIndex={-1}>
      <NotFoundContent />
    </main>
    <SiteFooter />
  </div>
);

export default NotFound;
