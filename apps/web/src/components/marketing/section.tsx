import { cn } from "@wovain/ui/lib/utils";
import type { ReactNode } from "react";

/** Page width and gutters for every public page. */
export const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export const displayTitle =
  "font-display text-display-2 font-semibold text-balance";

/** A public-page section: an id for anchors, its heading and an optional lead. */
export const Section = ({
  id,
  title,
  lead,
  aside,
  children,
  className,
  headerClassName,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className={cn("scroll-mt-20 py-20 sm:py-28", className)}
    id={id}
  >
    <div className={container}>
      <div
        className={cn(
          "flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-10",
          headerClassName
        )}
      >
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className={displayTitle} id={`${id}-title`}>
            {title}
          </h2>
          {lead ? (
            <p className="text-muted-foreground text-lg leading-relaxed">
              {lead}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </div>
  </section>
);
