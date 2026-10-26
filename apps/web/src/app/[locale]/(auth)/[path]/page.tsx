import type { AuthView as View } from "@better-auth-ui/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthView } from "@/components/auth-view";
import { SignedInRedirect } from "@/components/signed-in-redirect";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";

// The Better Auth UI views that have no page of their own: the password
// reset request and the confirmation and callback screens around it.
const VIEWS = {
  "auth-callback": "callback",
  "auth-error": "error",
  "auth-redirect": "redirect",
  "forgot-password": "forgotPassword",
  "reset-link-sent": "resetLinkSent",
  "sign-out": "signOut",
  "verify-email": "verifyEmail",
} as const satisfies Record<string, View>;

const isPath = (path: string): path is keyof typeof VIEWS =>
  Object.hasOwn(VIEWS, path);

// Each view's page title: the reset screens are about the password, the
// callback, redirect, error and sign-out screens about signing in, and email
// verification about the new account.
const TITLES = {
  "auth-callback": "login",
  "auth-error": "login",
  "auth-redirect": "login",
  "forgot-password": "reset",
  "reset-link-sent": "reset",
  "sign-out": "login",
  "verify-email": "signUp",
} as const satisfies Record<keyof typeof VIEWS, string>;

export const dynamicParams = false;

export const generateStaticParams = () =>
  Object.keys(VIEWS).map((path) => ({ path }));

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/[path]">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  const { path } = await params;
  const title = isPath(path) ? TITLES[path] : "login";
  return pageMetadata({
    descriptionKey: `${title}Description`,
    index: false,
    locale,
    path: `/${path}`,
    titleKey: `${title}Title`,
  });
};

const AuthPathPage = async ({ params }: PageProps<"/[locale]/[path]">) => {
  await enterLocale(params);
  const { path } = await params;
  if (!isPath(path)) {
    notFound();
  }
  return (
    <>
      {path === "auth-error" ? <SignedInRedirect /> : null}
      <AuthView view={VIEWS[path]} />
    </>
  );
};

export default AuthPathPage;
