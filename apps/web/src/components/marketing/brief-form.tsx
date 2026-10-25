import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { getPathname } from "@/i18n/navigation";

/**
 * The page's working action: a plain GET form, so it works before JavaScript
 * loads. Signed-out visitors are sent to sign in and come back with the brief.
 */
export const BriefForm = async ({
  id = "hero-brief",
  className,
  defaultValue,
}: {
  id?: string;
  className?: string;
  defaultValue?: string | undefined;
}) => {
  const t = await getTranslations("Home");
  const locale = await getLocale();
  const action = getPathname({ href: "/dashboard/new", locale });

  return (
    <form
      action={action}
      className={cn(
        "border-input bg-card shadow-raised focus-within:border-primary focus-within:ring-ring/25 w-full max-w-2xl rounded-2xl border p-2 transition-colors focus-within:ring-3",
        className
      )}
      method="get"
    >
      <label className="block px-3 pt-2 text-sm font-medium" htmlFor={id}>
        {t("briefLabel")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          defaultValue={defaultValue}
          className="placeholder:text-muted-foreground h-12 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base outline-none"
          id={id}
          maxLength={280}
          minLength={10}
          name="brief"
          placeholder={t("briefPlaceholder")}
          required
          type="text"
        />
        <button
          className={cn(
            buttonVariants(),
            "h-12 rounded-xl px-5 text-[0.95rem]"
          )}
          type="submit"
        >
          {t("briefSubmit")}
          <ArrowRight
            aria-hidden="true"
            className="rtl:rotate-180"
            data-icon="inline-end"
          />
        </button>
      </div>
      <p
        className="text-muted-foreground px-3 pt-1 pb-1.5 text-xs"
        id={`${id}-hint`}
      >
        {t("briefHint")}
      </p>
    </form>
  );
};
