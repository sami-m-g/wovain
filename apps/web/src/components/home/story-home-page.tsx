import { Button } from "@wovain/ui/components/button";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { WarmDirections } from "@/components/app/drop-directions";
import { OpenDrops } from "@/components/app/runs-list";
import {
  HomeDirections,
  HomeResults,
  NextAction,
  SELLS_NOW_ID,
} from "@/components/home/story-home";
import { Link } from "@/i18n/navigation";

/**
 * The story-ui Home (openspec story-ui), read top to bottom: the next
 * action, what sells now (Qloo), the drops in progress, then results.
 */
export const StoryHome = async ({ name }: { name: string }) => {
  const t = await getTranslations("StoryHome");

  return (
    <div className="flex flex-col gap-10">
      {/* Finds the new-drop suggestions in the background. */}
      <WarmDirections />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {t("greeting", { name })}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[60ch]">{t("lead")}</p>
        </div>
        <Button
          className="h-9 w-fit px-4"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t("start")}
        </Button>
      </div>
      <NextAction />
      <HomeDirections />
      <section aria-labelledby="open-drops" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            className="font-display text-lg font-semibold tracking-[-0.015em]"
            id="open-drops"
          >
            {t("progress.title")}
          </h2>
          <Link
            className="text-accent-text text-sm font-medium hover:underline"
            href="/dashboard/drops"
          >
            {t("progress.all")}
          </Link>
        </div>
        <OpenDrops
          empty={
            <p className="text-muted-foreground border-input rounded-xl border border-dashed px-5 py-6 text-sm">
              {t("progress.empty")}{" "}
              <a
                className="text-accent-text font-medium underline underline-offset-2"
                href={`#${SELLS_NOW_ID}`}
              >
                {t("progress.emptyLink")}
              </a>
            </p>
          }
          limit={3}
        />
      </section>
      <HomeResults />
    </div>
  );
};
