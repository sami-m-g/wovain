import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@wovain/ui/components/item";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  CreditCard,
  Palette,
  PlugZap,
  UserRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

const SECTIONS: readonly {
  href:
    | "/dashboard/connections"
    | "/dashboard/billing"
    | "/dashboard/settings/account"
    | { pathname: "/dashboard/onboarding"; query: { step: "brand" } };
  icon: LucideIcon;
  key: "connections" | "brand" | "billing" | "account";
}[] = [
  { href: "/dashboard/connections", icon: PlugZap, key: "connections" },
  {
    href: { pathname: "/dashboard/onboarding", query: { step: "brand" } },
    icon: Palette,
    key: "brand",
  },
  { href: "/dashboard/billing", icon: CreditCard, key: "billing" },
  { href: "/dashboard/settings/account", icon: UserRound, key: "account" },
];

/**
 * Settings in the story rail: the accounts wovain acts through, the
 * optional brand, billing and the merchant's account, one link each.
 */
export const SettingsHub = async () => {
  const t = await getTranslations("SettingsHub");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
      </div>
      <ul className="border-border bg-card divide-border flex flex-col divide-y rounded-xl border">
        {SECTIONS.map(({ href, icon: Icon, key }) => (
          <li key={key}>
            <Item
              className="rounded-none px-4 py-4 sm:px-5"
              render={<Link href={href} />}
            >
              <ItemMedia variant="icon">
                <Icon aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t(`${key}.title`)}</ItemTitle>
                <ItemDescription>{t(`${key}.body`)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRight
                  aria-hidden="true"
                  className="text-muted-foreground size-4 rtl:rotate-180"
                />
              </ItemActions>
            </Item>
          </li>
        ))}
      </ul>
    </div>
  );
};
