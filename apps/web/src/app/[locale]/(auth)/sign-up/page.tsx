import type { Metadata } from "next";

import { AuthView } from "@/components/auth-view";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/sign-up">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "signUpDescription",
    locale,
    path: "/sign-up",
    titleKey: "signUpTitle",
  });
};

const SignUpPage = async ({ params }: PageProps<"/[locale]/sign-up">) => {
  await enterLocale(params);
  return <AuthView view="signUp" />;
};

export default SignUpPage;
