import { cn } from "@wovain/ui/lib/utils";
import type { ReactNode } from "react";

export type Ink = "indigo" | "rhodamine" | "yellow" | "green" | "black";

/** Ink field classes; text on each ink keeps at least 4.5:1 contrast. */
export const inkField: Record<Ink, string> = {
  black: "bg-ink-black text-white",
  green: "bg-ink-green text-white",
  indigo: "bg-ink-indigo text-white",
  rhodamine: "bg-ink-rhodamine text-white",
  yellow: "bg-ink-yellow text-ink-black",
};

/** Printed on chip code strips, swatch-book style. */
export const INK_HEX: Record<Ink, string> = {
  black: "#14162E",
  green: "#0D7A51",
  indigo: "#3B4CCA",
  rhodamine: "#C81E63",
  yellow: "#F2C230",
};

/** Each flow stage always prints in the same ink, on every surface. */
export const STAGE_INK = {
  ads: "indigo",
  brief: "black",
  campaign: "indigo",
  designs: "rhodamine",
  products: "green",
  trends: "yellow",
} as const satisfies Record<string, Ink>;

/**
 * One swatch-book chip: a solid ink field over a white strip with its code.
 * `ghost` draws an unlit chip (a step that hasn't run or is skipped).
 */
export const Swatch = ({
  ink,
  code,
  name,
  children,
  ghost = false,
  className,
  fieldClassName,
}: {
  ink: Ink;
  code: string;
  name: ReactNode;
  children?: ReactNode;
  ghost?: boolean;
  className?: string;
  fieldClassName?: string;
}) => (
  <div
    className={cn(
      "bg-card text-card-foreground flex flex-col shadow-[0_1px_2px_rgb(20_22_46/0.08),0_8px_24px_-12px_rgb(20_22_46/0.25)]",
      ghost && "border-input border border-dashed bg-transparent shadow-none",
      className
    )}
  >
    <div
      className={cn(
        "flex min-h-24 flex-1 flex-col justify-end p-3",
        ghost ? "text-muted-foreground" : inkField[ink],
        fieldClassName
      )}
    >
      <span className="font-semi-expanded text-lg leading-tight font-extrabold">
        {name}
      </span>
    </div>
    <div className="flex flex-col gap-0.5 px-3 py-2">
      <span className="font-condensed text-muted-foreground text-xs font-semibold tracking-wide uppercase tabular-nums">
        {code}
      </span>
      {children ? <div className="text-sm leading-snug">{children}</div> : null}
    </div>
  </div>
);
