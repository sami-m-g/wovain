import type { Metadata } from "next";

import { SettingsHub } from "@/components/home/settings-hub";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/settings",
    titleKey: "settingsHubTitle",
  });
};

// With story-ui, Settings gathers connections, the optional brand, billing
// and the account; without it, the account settings open.
const SettingsIndexPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings">) => {
  const locale = await enterLocale(params);
  const session = await requireSession(locale, "/dashboard/settings");
  if (!(await core.flags.isOn("story-ui", { userId: session.user.id }))) {
    return redirect({ href: "/dashboard/settings/account", locale });
  }
  return <SettingsHub />;
};

export default SettingsIndexPage;
