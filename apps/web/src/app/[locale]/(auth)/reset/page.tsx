import type { Metadata } from "next";

import { AuthView } from "@/components/auth-view";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/reset">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "resetDescription",
    index: false,
    locale,
    path: "/reset",
    titleKey: "resetTitle",
  });
};

const ResetPage = async ({ params }: PageProps<"/[locale]/reset">) => {
  await enterLocale(params);
  return <AuthView view="resetPassword" />;
};

export default ResetPage;
