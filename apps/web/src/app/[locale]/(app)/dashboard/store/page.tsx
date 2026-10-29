import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreDashboard } from "@/components/store/store-dashboard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/store">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/store",
    titleKey: "storeTitle",
  });
};

// Store management (openspec store-management), behind its flag: the data
// comes from packages/api (store.*, approvals.*). /dashboard/products
// redirects here (next.config.ts).
const StorePage = async ({
  params,
}: PageProps<"/[locale]/dashboard/store">) => {
  const locale = await enterLocale(params);
  const session = await requireSession(locale, "/dashboard/store");
  const on = await core.flags.isOn("store-management", {
    userId: session.user.id,
  });
  if (!on) {
    notFound();
  }
  return <StoreDashboard />;
};

export default StorePage;
