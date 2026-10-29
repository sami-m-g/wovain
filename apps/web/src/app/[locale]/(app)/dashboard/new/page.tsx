import type { Metadata } from "next";
import { Suspense } from "react";

import { NewDropWizard } from "@/components/app/new-drop-wizard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

const MAX_BRIEF = 280;
const RUN_ID = /^[\w-]{1,64}$/u;

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
  const session = await requireSession(locale, next);
  const story = await core.flags.isOn("story-ui", { userId: session.user.id });
  // story-ui: a drop that has a run lives on its own page.
  if (story && initialRunId !== undefined && RUN_ID.test(initialRunId)) {
    redirect({
      href: `/dashboard/drops/${initialRunId}`,
      locale,
    });
  }

  // The flow reads ?run, ?step and ?brief itself, so it can move between
  // steps in the URL without a server round trip.
  return (
    <Suspense>
      <NewDropWizard story={story} />
    </Suspense>
  );
};

export default NewDropPage;
