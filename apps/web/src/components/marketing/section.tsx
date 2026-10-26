import type { ReactNode } from "react";

/** Page width and gutters for every public page. */
export const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export const displayTitle =
  "font-display text-display-2 font-semibold text-balance";

/** A section's small label, led by a short stitched rule. */
export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground flex items-center gap-3 text-xs font-medium tracking-[0.14em] uppercase">
    <span
      aria-hidden="true"
      className="border-foreground/40 w-6 border-t border-dashed"
    />
    {children}
  </p>
);
