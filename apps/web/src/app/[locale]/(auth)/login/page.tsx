import type { Metadata } from "next";

import { AuthView } from "@/components/auth-view";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "loginDescription",
    locale,
    path: "/login",
    titleKey: "loginTitle",
  });
};

const LoginPage = async ({ params }: PageProps<"/[locale]/login">) => {
  await enterLocale(params);
  return <AuthView view="signIn" />;
};

export default LoginPage;
