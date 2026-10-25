import { Skeleton } from "@wovain/ui/components/skeleton";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { ENV } from "@/env.server";

const FormFallback = ({ fields }: { fields: number }) => (
  <div aria-hidden="true" className="mt-8 flex flex-col gap-5">
    {Array.from({ length: fields }, (_, index) => (
      <div className="flex flex-col gap-2" key={index}>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    ))}
    <Skeleton className="h-11 w-full rounded-lg" />
  </div>
);

/**
 * Sign-in and sign-up: the heading renders on the server, so it paints before
 * any JavaScript; the form itself reads the URL (?next=) on the client.
 */
export const AuthPage = async ({ mode }: { mode: "login" | "signUp" }) => {
  const t = await getTranslations("Auth");
  const google = Boolean(ENV.GOOGLE_CLIENT_ID && ENV.GOOGLE_CLIENT_SECRET);
  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
        {mode === "signUp" ? t("signUpTitle") : t("loginTitle")}
      </h1>
      <p className="text-muted-foreground mt-3">
        {mode === "signUp" ? t("signUpLead") : t("loginLead")}
      </p>
      <Suspense fallback={<FormFallback fields={mode === "signUp" ? 3 : 2} />}>
        <AuthForm google={google} mode={mode} />
      </Suspense>
    </div>
  );
};
