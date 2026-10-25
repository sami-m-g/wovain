"use client";

import { Button } from "@wovain/ui/components/button";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Better Auth's OAuth provider sends the merchant here when an app (such as
 * ChatGPT) asks to act on their account. The signed query in the URL rides
 * along with the answer (oauthProviderClient); the server checks it before
 * redirecting back to the app.
 */
export const ConsentPanel = () => {
  const t = useTranslations("Consent");
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const scopes = (searchParams.get("scope") ?? "")
    .split(" ")
    .filter((scope) => scope !== "");

  const answer = async (accept: boolean) => {
    setPending(true);
    setError(false);
    const { data, error: failed } = await authClient.oauth2.consent({ accept });
    if (failed !== null) {
      setPending(false);
      setError(true);
      return;
    }
    if (typeof data?.url === "string") {
      window.location.assign(data.url);
    }
  };

  return (
    <div className="w-full max-w-md">
      <ShieldCheck aria-hidden="true" className="text-primary size-8" />
      <h1 className="font-expanded mt-4 text-3xl leading-[1.05] font-black tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-3">{t("lead")}</p>
      {scopes.length > 0 ? (
        <div className="mt-6">
          <h2 className="font-condensed text-muted-foreground text-xs font-bold tracking-widest uppercase">
            {t("scopes")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {scopes.map((scope) => (
              <li
                className="border-border bg-muted border px-2 py-1 font-mono text-xs"
                key={scope}
              >
                {scope}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p
          className="border-destructive/40 bg-destructive/10 text-destructive mt-6 border px-3 py-2 text-sm"
          role="alert"
        >
          {t("error")}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          className="h-11 px-6 text-sm font-semibold"
          disabled={pending}
          onClick={() => answer(true)}
        >
          {t("allow")}
        </Button>
        <Button
          className="h-11 px-6 text-sm font-semibold"
          disabled={pending}
          onClick={() => answer(false)}
          variant="outline"
        >
          {t("deny")}
        </Button>
      </div>
      <p className="text-muted-foreground mt-6 text-xs">{t("note")}</p>
    </div>
  );
};
