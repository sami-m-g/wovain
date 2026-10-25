"use client";

import { Button } from "@wovain/ui/components/button";
import { useTranslations } from "next-intl";

const ErrorPage = ({ reset }: { error: Error; reset: () => void }) => {
  const t = useTranslations("Error");
  return (
    <main
      className="mx-auto flex min-h-[60svh] max-w-2xl flex-col justify-center px-4 py-20 outline-none sm:px-6"
      id="main"
      tabIndex={-1}
    >
      <h1 className="font-display text-display-2 font-semibold">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mt-5 text-lg">{t("body")}</p>
      <Button className="mt-8 h-11 w-fit rounded-xl px-5" onClick={reset}>
        {t("retry")}
      </Button>
    </main>
  );
};

export default ErrorPage;
