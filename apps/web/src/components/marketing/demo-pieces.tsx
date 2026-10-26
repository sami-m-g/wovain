import { Badge } from "@wovain/ui/components/badge";
import { Card } from "@wovain/ui/components/card";
import { cn } from "@wovain/ui/lib/utils";
import { Pause } from "lucide-react";
import type { ReactNode } from "react";

import { ShuttleMark } from "@/components/brand/shuttle-mark";
import { TeeMockup } from "@/components/marketing/example-art";
import { PartnerLogo } from "@/components/marketing/partner-logo";

/** The garment colours the example drop prints on. */
export const BLANK_COLOURS = {
  bone: "#ece6da",
  moss: "#5b6b4f",
  slate: "#3d4450",
  stone: "#c9c3b6",
} as const;

/** The badge every Meta campaign carries when wovain creates it. */
export const PausedBadge = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <Badge
    className={cn(
      "bg-card text-foreground border-border shadow-raised h-7 gap-1.5 px-2.5 text-xs",
      className
    )}
    variant="outline"
  >
    <Pause aria-hidden="true" className="text-primary size-3 fill-current" />
    {children}
  </Badge>
);

/** A product as Fourthwall lists it: the blank with the design, title and price. */
export const ProductListing = ({
  art,
  colour,
  title,
  price,
  status,
  detail,
  className,
}: {
  art: ReactNode;
  colour: string;
  title: string;
  price: string;
  status?: string;
  detail?: ReactNode;
  className?: string;
}) => (
  <Card className={cn("gap-0 overflow-hidden py-0", className)}>
    <div className="bg-muted relative grid place-items-center p-3">
      <TeeMockup art={art} className="aspect-square w-full" colour={colour} />
      {status ? (
        <Badge className="absolute end-2.5 top-2.5" variant="secondary">
          {status}
        </Badge>
      ) : null}
    </div>
    <div className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center opacity-80 [&_img]:h-3.5">
          <PartnerLogo name="fourthwall" />
        </span>
        <span className="figures font-mono text-sm font-semibold">{price}</span>
      </div>
      <p className="truncate text-sm font-semibold">{title}</p>
      {detail}
    </div>
  </Card>
);

/** A feed ad as Meta previews it, labelled with the label's own mark. */
export const AdPreview = ({
  art,
  colour,
  brand,
  sponsored,
  body,
  headline,
  cta,
  footer,
  className,
}: {
  art: ReactNode;
  colour: string;
  brand: string;
  sponsored: string;
  body: string;
  headline: string;
  cta: string;
  footer?: ReactNode;
  className?: string;
}) => (
  <Card className={cn("gap-0 overflow-hidden py-0", className)}>
    <div className="flex items-center gap-2 p-3">
      <ShuttleMark label={null} size={28} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-semibold">{brand}</span>
        <span className="text-muted-foreground text-[0.7rem]">{sponsored}</span>
      </div>
      <span className="ms-auto flex items-center [&_svg]:h-3.5">
        <PartnerLogo name="meta" />
      </span>
    </div>
    <div className="px-3 pb-2.5">
      <p className="line-clamp-2 text-xs leading-snug">{body}</p>
    </div>
    <div className="bg-muted grid place-items-center px-10 py-2">
      <TeeMockup art={art} className="aspect-square w-full" colour={colour} />
    </div>
    <div className="bg-muted/60 border-border flex items-center justify-between gap-3 border-t px-3 py-2.5">
      <span className="truncate text-xs font-semibold">{headline}</span>
      <span className="bg-secondary text-secondary-foreground shrink-0 rounded-md px-2.5 py-1 text-[0.7rem] font-semibold">
        {cta}
      </span>
    </div>
    {footer}
  </Card>
);
