import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@wovain/ui/components/reui/frame";
import { cn } from "@wovain/ui/lib/utils";
import type { ReactNode } from "react";

const COLUMNS_WIDE = 4;

export interface Kpi {
  label: string;
  /** Already formatted for the merchant's locale; "–" when unknown. */
  value: string;
  hint?: string | undefined;
}

/**
 * A row of headline numbers in a ReUI Frame, in the spirit of
 * dashboard-01's section cards: label over a large tabular figure.
 */
export const KpiFrame = ({
  title,
  source,
  kpis,
  children,
}: {
  title: string;
  source: string;
  kpis: Kpi[];
  children?: ReactNode;
}) => (
  <Frame>
    <FrameHeader className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <FrameTitle className="font-display text-lg font-semibold tracking-[-0.015em]">
        <h2>{title}</h2>
      </FrameTitle>
      <FrameDescription className="text-xs">{source}</FrameDescription>
    </FrameHeader>
    <dl
      className={cn(
        "grid grid-cols-2 gap-(--frame-gap)",
        kpis.length === COLUMNS_WIDE
          ? "lg:grid-cols-4"
          : "sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2"
      )}
    >
      {kpis.map((kpi) => (
        <FramePanel className="flex flex-col gap-1" key={kpi.label}>
          <dt className="text-muted-foreground text-sm">{kpi.label}</dt>
          <dd className="font-display figures text-2xl font-semibold tracking-[-0.02em]">
            {kpi.value}
          </dd>
          {kpi.hint ? (
            <dd className="text-muted-foreground text-xs">{kpi.hint}</dd>
          ) : null}
        </FramePanel>
      ))}
    </dl>
    {children}
  </Frame>
);
