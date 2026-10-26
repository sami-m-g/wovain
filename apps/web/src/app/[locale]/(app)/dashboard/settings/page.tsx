import { enterLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";

const SettingsIndexPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings">) => {
  const locale = await enterLocale(params);
  return redirect({ href: "/dashboard/settings/account", locale });
};

export default SettingsIndexPage;
