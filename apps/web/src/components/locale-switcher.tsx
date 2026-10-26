"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wovain/ui/components/select";
import { cn } from "@wovain/ui/lib/utils";
import { Languages } from "lucide-react";
import { hasLocale, useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Switches the interface language, keeping the visitor on the same page. */
export const LocaleSwitcher = ({ className }: { className?: string }) => {
  const t = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const items = routing.locales.map((item) => ({
    label: t(`localeNames.${item}`),
    value: item,
  }));

  return (
    <Select
      disabled={isPending}
      items={items}
      onValueChange={(next) => {
        if (typeof next !== "string" || !hasLocale(routing.locales, next)) {
          return;
        }
        startTransition(() => {
          router.replace(pathname, { locale: next });
        });
      }}
      value={locale}
    >
      <SelectTrigger
        aria-label={t("language")}
        className={cn("h-9 rounded-lg font-medium", className)}
      >
        <Languages aria-hidden="true" className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} lang={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
