import type { AuthView as View } from "@better-auth-ui/core";
import { billingCatalog } from "@wovain/billing/catalog";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Auth } from "@/components/auth/auth";
import { Link } from "@/i18n/navigation";

const HEADED_VIEWS: ReadonlySet<View> = new Set([
  "signIn",
  "signUp",
  "forgotPassword",
  "resetPassword",
  "verifyEmail",
]);

const headingFor = async (view: View) => {
  const auth = await getTranslations("Auth");
  const reset = await getTranslations("Reset");
  switch (view) {
    case "signIn": {
      return { lead: auth("loginLead"), title: auth("loginTitle") };
    }
    case "signUp": {
      return {
        lead: auth("signUpLead", {
          credits: billingCatalog().plans.free.monthlyCredits,
        }),
        title: auth("signUpTitle"),
      };
    }
    case "forgotPassword": {
      return { lead: reset("requestLead"), title: reset("requestTitle") };
    }
    case "resetPassword": {
      return { lead: reset("lead"), title: reset("title") };
    }
    case "verifyEmail": {
      return { lead: auth("verifyLead"), title: auth("verifyTitle") };
    }
    default: {
      return null;
    }
  }
};

// Better Auth UI's verify-email card offers resend and sign-in; a merchant who
// typed the wrong address signs up again with the right one.
const ChangeEmail = async () => {
  const auth = await getTranslations("Auth");
  return (
    <p className="text-muted-foreground mt-4 text-center text-sm">
      {auth("verifyWrongEmail")}{" "}
      <Link
        className="text-foreground underline underline-offset-4"
        href="/sign-up"
        prefetch={false}
      >
        {auth("verifyWrongEmailLink")}
      </Link>
    </p>
  );
};

/**
 * One Better Auth UI view with wovain's heading above it. The heading renders
 * on the server, so it paints before any JavaScript; the form is the
 * library's, drawn with our tokens. Its own card title is hidden where our
 * heading replaces it.
 */
export const AuthView = async ({ view }: { view: View }) => {
  const heading = await headingFor(view);
  return (
    <div className="w-full max-w-sm">
      {heading ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {heading.title}
          </h1>
          <p className="text-muted-foreground mt-3 mb-6">{heading.lead}</p>
        </>
      ) : null}
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
        <Auth
          className={
            HEADED_VIEWS.has(view)
              ? "max-w-none bg-transparent p-0 shadow-none ring-0 [&_[data-slot=card-header]]:hidden"
              : "max-w-none"
          }
          view={view}
        />
      </Suspense>
      {view === "verifyEmail" ? <ChangeEmail /> : null}
    </div>
  );
};
