import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AuthPage } from "@/components/auth/auth-page";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/sign-up">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({
    descriptionKey: "signUpDescription",
    locale,
    path: "/sign-up",
    titleKey: "signUpTitle",
  });
};

const SignUpPage = async ({ params }: PageProps<"/[locale]/sign-up">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <AuthPage mode="signUp" />;
};

export default SignUpPage;
