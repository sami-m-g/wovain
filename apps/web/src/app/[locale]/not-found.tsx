import { Button } from "@wovain/ui/components/button";
import { useTranslations } from "next-intl";

import { Swatch } from "@/components/brand/swatch";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Link } from "@/i18n/navigation";

const NotFoundContent = () => {
  const t = useTranslations("NotFound");
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_14rem]">
      <div>
        <h1 className="font-expanded text-4xl leading-[1] font-black tracking-tight sm:text-6xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-5 text-lg">{t("body")}</p>
        <Button
          className="mt-8 h-12 px-5 text-sm font-semibold"
          nativeButton={false}
          render={<Link href="/" />}
        >
          {t("home")}
        </Button>
      </div>
      <Swatch
        className="max-w-56 rotate-3"
        code="WV 404"
        fieldClassName="min-h-56"
        ghost
        ink="indigo"
        name="404"
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
