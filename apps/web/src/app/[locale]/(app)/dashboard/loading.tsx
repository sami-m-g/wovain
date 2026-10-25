import { Skeleton } from "@wovain/ui/components/skeleton";
import { useTranslations } from "next-intl";

const DashboardLoading = () => {
  const t = useTranslations("Common");
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <output className="sr-only">{t("loading")}</output>
      <Skeleton className="h-12 w-2/3 max-w-md" />
      <Skeleton className="h-5 w-1/2 max-w-sm" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
};

export default DashboardLoading;
