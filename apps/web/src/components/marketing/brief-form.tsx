import { Button } from "@wovain/ui/components/button";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { getPathname } from "@/i18n/navigation";

/**
 * The hero's working action: a plain GET form, so it works before JavaScript
 * loads. Signed-out visitors are sent to sign in and come back with the brief.
 */
export const BriefForm = async () => {
  const t = await getTranslations("Home");
  const locale = await getLocale();
  const action = getPathname({ href: "/dashboard/new", locale });

  return (
    <form
      action={action}
      className="border-foreground/80 bg-card w-full max-w-2xl border p-2 shadow-[0_18px_40px_-24px_rgb(20_22_46/0.45)]"
      method="get"
    >
      <label
        className="font-condensed text-muted-foreground block px-2 pt-1 text-xs font-bold tracking-widest uppercase"
        htmlFor="hero-brief"
      >
        {t("briefLabel")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-describedby="hero-brief-hint"
          autoComplete="off"
          className="placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent px-2 text-base focus-visible:outline-offset-0"
          id="hero-brief"
          maxLength={280}
          minLength={10}
          name="brief"
          placeholder={t("briefPlaceholder")}
          required
          type="text"
        />
        <Button className="h-12 px-5 text-sm font-semibold" type="submit">
          {t("briefSubmit")}
          <ArrowRight
            aria-hidden="true"
            className="rtl:rotate-180"
            data-icon="inline-end"
          />
        </Button>
      </div>
      <p
        className="text-muted-foreground px-2 pt-1 pb-1 text-xs"
        id="hero-brief-hint"
      >
        {t("briefHint")}
      </p>
    </form>
  );
};
