"use client";

import { cn } from "@wovain/ui/lib/utils";
import { Languages } from "lucide-react";
import { hasLocale, useLocale, useTranslations } from "next-intl";
import { useId, useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export const LocaleSwitcher = ({ className }: { className?: string }) => {
  const t = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const id = useId();

  return (
    <div className={cn("relative flex items-center", className)}>
      <label className="sr-only" htmlFor={id}>
        {t("language")}
      </label>
      <Languages
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute start-2.5 size-4"
      />
      <select
        className="border-input hover:bg-muted h-10 appearance-none border bg-transparent ps-8 pe-3 text-sm font-medium disabled:opacity-60"
        disabled={isPending}
        id={id}
        onChange={(event) => {
          const next = event.target.value;
          if (!hasLocale(routing.locales, next)) {
            return;
          }
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
        value={locale}
      >
        {routing.locales.map((item) => (
          <option key={item} lang={item} value={item}>
            {t(`localeNames.${item}`)}
          </option>
        ))}
      </select>
    </div>
  );
};
