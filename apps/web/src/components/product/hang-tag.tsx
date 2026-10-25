import { cn } from "@wovain/ui/lib/utils";
import type { ReactNode } from "react";

export interface TagLine {
  label: ReactNode;
  value: ReactNode;
  /** The line the tag exists to show (profit, the total). */
  emphasis?: boolean;
}

/**
 * The hang tag: the one shaped object in the system. It carries the evidence
 * for a product as ruled spec lines (price, blank, fees, profit, margin, status)
 * on light card stock in both themes. `string` draws the cord it hangs from.
 */
export const HangTag = ({
  title,
  subtitle,
  lines,
  footer,
  string = false,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  lines: TagLine[];
  footer?: ReactNode;
  string?: boolean;
  className?: string;
}) => (
  <div
    className={cn(
      "relative [filter:drop-shadow(var(--elevation-tag-drop))]",
      className
    )}
  >
    {string ? (
      <span
        aria-hidden="true"
        className="bg-foreground/50 absolute start-1/2 -top-14 h-16 w-px -translate-x-1/2 rotate-[8deg] rtl:translate-x-1/2"
      />
    ) : null}
    <div className="hang-tag bg-tag text-tag-ink relative flex flex-col px-5 pt-9 pb-5">
      <span
        aria-hidden="true"
        className="border-tag-ink/25 bg-background absolute start-1/2 top-3 size-3.5 -translate-x-1/2 rounded-full border-2 rtl:translate-x-1/2"
      />
      <p className="font-display text-lg leading-tight font-semibold tracking-[-0.02em]">
        {title}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs text-[color-mix(in_oklab,var(--tag-ink)_70%,var(--tag))]">
          {subtitle}
        </p>
      ) : null}
      <dl className="mt-4 flex flex-col text-[0.8rem]">
        {lines.map((line, index) => (
          <div
            className={cn(
              "figures flex items-baseline justify-between gap-4 border-t border-[color-mix(in_oklab,var(--tag-ink)_14%,var(--tag))] py-1.5",
              line.emphasis && "border-t-tag-ink/60 font-semibold"
            )}
            // oxlint-disable-next-line react/no-array-index-key -- lines are positional and never reorder
            key={index}
          >
            <dt>{line.label}</dt>
            <dd className="text-end font-mono">{line.value}</dd>
          </div>
        ))}
      </dl>
      {footer ? (
        <div className="mt-3 border-t border-[color-mix(in_oklab,var(--tag-ink)_14%,var(--tag))] pt-3 text-xs">
          {footer}
        </div>
      ) : null}
    </div>
  </div>
);
