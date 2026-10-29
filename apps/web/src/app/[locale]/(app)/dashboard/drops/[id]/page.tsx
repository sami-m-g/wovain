import type { Metadata } from "next";
import { Suspense } from "react";

import { NewDropWizard } from "@/components/app/new-drop-wizard";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { core } from "@/services";

const RUN_ID = /^[\w-]{1,64}$/u;

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/drops/[id]">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  const { id } = await params;
  return pageMetadata({
    index: false,
    locale,
    path: `/dashboard/drops/${id}`,
    titleKey: "dropTitle",
  });
};

// One drop, read top to bottom (openspec story-ui). Without the flag, the
// drop opens in the step-by-step flow as before.
const DropPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/drops/[id]">) => {
  const locale = await enterLocale(params);
  const { id } = await params;
  if (!RUN_ID.test(id)) {
    return redirect({ href: "/dashboard/drops", locale });
  }
  const session = await requireSession(locale, `/dashboard/drops/${id}`);
  if (!(await core.flags.isOn("story-ui", { userId: session.user.id }))) {
    return redirect({
      href: { pathname: "/dashboard/new", query: { run: id } },
      locale,
    });
  }
  return (
    <Suspense>
      <NewDropWizard runId={id} story />
    </Suspense>
  );
};

export default DropPage;
