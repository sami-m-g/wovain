import { ItemMedia } from "@wovain/ui/components/item";
import { cn } from "@wovain/ui/lib/utils";
import type { ComponentType, SVGProps } from "react";

import { Fal } from "@/components/ui/svgs/fal";
import { Fourthwall } from "@/components/ui/svgs/fourthwall";
import { Meta } from "@/components/ui/svgs/meta";

/** The services wovain names in the app, with their official marks. */
const LOGOS = {
  fal: Fal,
  fourthwall: Fourthwall,
  meta: Meta,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type LogoService = keyof typeof LOGOS;

/**
 * A provider's mark on a card-stock tile, sized for an Item. Marks are
 * decorative here: the provider's name always sits next to the tile.
 */
export const ProviderLogo = ({
  service,
  className,
}: {
  service: LogoService;
  className?: string;
}) => {
  const Mark = LOGOS[service];
  return (
    <ItemMedia
      aria-hidden="true"
      className={cn(
        "border-border bg-card text-foreground size-10 rounded-lg border",
        className
      )}
    >
      <Mark className="h-4.5 w-auto max-w-6" />
    </ItemMedia>
  );
};
