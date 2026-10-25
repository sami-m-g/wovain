import { cn } from "@wovain/ui/lib/utils";
import { Check, History, LayoutGrid, PlugZap, Plus, X } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { MossFernArt, RepotClubArt } from "@/components/marketing/example-art";
import { HangTag } from "@/components/product/hang-tag";
import { RunTape, STAGE_COUNT } from "@/components/product/run-tape";
import { priceBreakdown } from "@/lib/pricing";

/** A typical tee's base cost when the catalog doesn't say (core's DEFAULT_BASE_COST). */
const EXAMPLE_BASE_COST = 12;
const CHECK_READY = 88;
const CHECK_REVISE = 61;

const NAV = [
  { icon: LayoutGrid, key: "overview" },
  { icon: Plus, key: "newDrop" },
  { icon: History, key: "runs" },
  { icon: PlugZap, key: "connections" },
] as const;

/** A button as drawn in the example: looks like the app's, does nothing. */
const FakeButton = ({
  children,
  primary = false,
}: {
  children: ReactNode;
  primary?: boolean;
}) => (
  <span
    className={cn(
      "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium",
      primary
        ? "bg-primary text-primary-foreground"
        : "border-input bg-card border"
    )}
  >
    {children}
  </span>
);

const DesignCard = ({
  art,
  title,
  printed,
  verdict,
  coach,
  approve,
  change,
  ready,
}: {
  art: ReactNode;
  title: string;
  printed: string;
  verdict: string;
  coach: string;
  approve: string;
  change: string;
  ready: boolean;
}) => (
  <div className="bg-card border-border flex flex-col overflow-hidden rounded-xl border">
    <div className="aspect-[4/3] overflow-hidden sm:aspect-square">{art}</div>
    <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground truncate text-xs">{printed}</p>
      <p className="text-xs leading-snug">
        <span
          className={cn(
            "me-1.5 inline-flex items-center gap-1 font-semibold",
            ready ? "text-success" : "text-warning"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              ready ? "bg-success" : "bg-warning"
            )}
          />
          {verdict}
        </span>
        <span className="text-muted-foreground">{coach}</span>
      </p>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
        <FakeButton primary>
          <Check aria-hidden="true" className="size-3.5" />
          {approve}
        </FakeButton>
        <FakeButton>
          <X aria-hidden="true" className="size-3.5" />
          {change}
        </FakeButton>
      </div>
    </div>
  </div>
);

/**
 * The hero's proof: the approval step of a run, drawn with the app's own
 * components and example data, with the product's hang tag hanging off it.
 * The window is inert: it is a picture of the product, described by its caption.
 */
export const ProductWindow = async () => {
  const t = await getTranslations("Home");
  const nav = await getTranslations("Shell.nav");
  const wizard = await getTranslations("Wizard");
  const format = await getFormatter();
  const money = (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
  const tag = priceBreakdown(EXAMPLE_BASE_COST);

  return (
    <figure className="relative">
      <div className="relative">
        <div
          className="border-border bg-background shadow-floating overflow-hidden rounded-2xl border"
          inert
        >
          <div className="flex">
            <div className="bg-sidebar text-sidebar-foreground hidden w-48 shrink-0 flex-col gap-6 p-4 lg:flex">
              <Logo height={20} tone="dark" />
              <ul className="flex flex-col gap-0.5 text-[0.8rem]">
                {NAV.map(({ icon: Icon, key }) => (
                  <li
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-2.5",
                      key === "newDrop"
                        ? "bg-sidebar-accent font-medium"
                        : "opacity-75"
                    )}
                    key={key}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                    {nav(key)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:gap-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-xl font-semibold tracking-[-0.02em]">
                  {wizard("designs.title")}
                </p>
                <p className="text-muted-foreground figures text-xs">
                  {wizard("stepOf", { current: 3, total: STAGE_COUNT })}
                </p>
              </div>
              <RunTape stage="designs" weave />
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:me-64">
                <DesignCard
                  approve={wizard("designs.approve")}
                  art={<MossFernArt className="size-full" />}
                  change={t("chatChange")}
                  coach={t("window.coachOne")}
                  printed={t("window.printedOne")}
                  ready
                  title={t("window.designOne")}
                  verdict={`${wizard("designs.checkReady")} ${wizard("designs.checkScore", { score: CHECK_READY })}`}
                />
                <div className="hidden sm:flex">
                  <DesignCard
                    approve={wizard("designs.approve")}
                    art={<RepotClubArt className="size-full" />}
                    change={t("chatChange")}
                    coach={t("window.coachTwo")}
                    printed={t("window.printedTwo")}
                    ready={false}
                    title={t("window.designTwo")}
                    verdict={`${wizard("designs.checkRevise")} ${wizard("designs.checkScore", { score: CHECK_REVISE })}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <HangTag
          className="mx-auto -mt-4 w-[17.5rem] rotate-[-2deg] xl:absolute xl:end-8 xl:top-36 xl:mt-0 xl:w-64 xl:rotate-[3deg]"
          footer={t("tag.campaign")}
          lines={[
            { label: t("tag.price"), value: money(tag.price) },
            { label: t("tag.blank"), value: `− ${money(tag.baseCost)}` },
            { label: t("tag.fees"), value: `− ${money(tag.cardFees)}` },
            { label: t("tag.reserve"), value: `− ${money(tag.refundReserve)}` },
            {
              emphasis: true,
              label: t("tag.profit"),
              value: money(tag.profit),
            },
            { label: t("tag.margin"), value: `${tag.marginPct}%` },
          ]}
          string
          subtitle={t("tag.subtitle")}
          title={t("tag.title")}
        />
      </div>
      <figcaption className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
        <span className="border-border rounded-full border px-2 py-0.5 font-medium">
          {t("example")}
        </span>
        {t("windowCaption")}
      </figcaption>
    </figure>
  );
};
