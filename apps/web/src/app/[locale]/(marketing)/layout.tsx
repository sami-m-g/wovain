import { MotionProvider } from "@/components/marketing/motion-provider";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { enterLocale } from "@/i18n/locale";

const MarketingLayout = async ({
  children,
  params,
}: LayoutProps<"/[locale]">) => {
  await enterLocale(params);
  return (
    <MotionProvider>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="flex-1 outline-none" id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </div>
    </MotionProvider>
  );
};

export default MarketingLayout;
