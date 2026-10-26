import type { Metadata } from "next";

import { NewDropWizard } from "@/components/app/new-drop-wizard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

const MAX_BRIEF = 280;

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/new">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    index: false,
    locale,
    path: "/dashboard/new",
    titleKey: "newDropTitle",
  });
};

const NewDropPage = async ({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/new">) => {
  const locale = await enterLocale(params);
  const { brief, run } = await searchParams;
  const initialRunId = typeof run === "string" ? run : undefined;
  const initialBrief =
    typeof brief === "string" ? brief.slice(0, MAX_BRIEF) : "";
  let next = initialBrief
    ? `/dashboard/new?brief=${encodeURIComponent(initialBrief)}`
    : "/dashboard/new";
  if (initialRunId) {
    next = `/dashboard/new?run=${encodeURIComponent(initialRunId)}`;
  }
  await requireSession(locale, next);

  return (
    <NewDropWizard initialBrief={initialBrief} initialRunId={initialRunId} />
  );
};

export default NewDropPage;
