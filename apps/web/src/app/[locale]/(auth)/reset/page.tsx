import type { Metadata } from "next";

import { ResetForm } from "@/components/auth/reset-form";
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

const ResetPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/reset">) => {
  await enterLocale(params);
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;
  return <ResetForm invalid={query.error !== undefined} token={token} />;
};

export default ResetPage;
