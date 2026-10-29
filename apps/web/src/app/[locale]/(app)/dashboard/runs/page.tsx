import { enterLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";

// Runs are called drops now: the old address keeps working.
const RunsPage = async ({ params }: PageProps<"/[locale]/dashboard/runs">) => {
  const locale = await enterLocale(params);
  redirect({ href: "/dashboard/drops", locale });
};

export default RunsPage;
