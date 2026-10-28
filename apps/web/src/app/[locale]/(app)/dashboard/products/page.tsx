import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreDashboard } from "@/components/store/store-dashboard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/products">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/products",
    titleKey: "productsTitle",
  });
};

// Store management (openspec store-management), behind its flag: the data
// comes from packages/api (store.*, approvals.*).
const ProductsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/products">) => {
  const locale = await enterLocale(params);
  const session = await requireSession(locale, "/dashboard/products");
  const on = await core.flags.isOn("store-management", {
    userId: session.user.id,
  });
  if (!on) {
    notFound();
  }
  return <StoreDashboard />;
};

export default ProductsPage;
