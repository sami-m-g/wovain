import type { AuthView as View } from "@better-auth-ui/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthView } from "@/components/auth-view";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

// The Better Auth UI views that have no page of their own: the password
// reset request and the confirmation and callback screens around it.
const VIEWS: Record<string, View> = {
  "auth-callback": "callback",
  "auth-error": "error",
  "auth-redirect": "redirect",
  "forgot-password": "forgotPassword",
  "reset-link-sent": "resetLinkSent",
  "sign-out": "signOut",
  "verify-email": "verifyEmail",
};

export const dynamicParams = false;

export const generateStaticParams = () =>
  Object.keys(VIEWS).map((path) => ({ path }));

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/[path]">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  const { path } = await params;
  return pageMetadata({
    descriptionKey: "resetDescription",
    index: false,
    locale,
    path: `/${path}`,
    titleKey: "resetTitle",
  });
};

const AuthPathPage = async ({ params }: PageProps<"/[locale]/[path]">) => {
  await enterLocale(params);
  const { path } = await params;
  const view = VIEWS[path];
  if (!view) {
    notFound();
  }
  return <AuthView view={view} />;
};

export default AuthPathPage;
