import { Separator } from "@wovain/ui/components/separator";
import type { ReactNode } from "react";

import { container } from "@/components/marketing/section";

interface FooterColumn {
  id: string;
  title: string;
  links: ReactNode[];
}

/** shadcn/studio's three-part footer: brand row, link columns, then the fine print. */
const Footer = ({
  brand,
  tagline,
  aside,
  columns,
  copyright,
}: {
  brand: ReactNode;
  tagline: string;
  aside: ReactNode;
  columns: FooterColumn[];
  copyright: string;
}) => (
  <footer className="bg-background">
    <Separator className="bg-border" />
    <div
      className={`${container} grid gap-10 py-14 md:grid-cols-[1.6fr_repeat(4,1fr)]`}
    >
      <div className="flex flex-col items-start gap-4">
        {brand}
        <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
          {tagline}
        </p>
        {aside}
      </div>
      {columns.map((column) => (
        <nav aria-labelledby={column.id} key={column.id}>
          <h2 className="text-sm font-medium" id={column.id}>
            {column.title}
          </h2>
          <ul className="mt-3 flex flex-col">{column.links}</ul>
        </nav>
      ))}
    </div>
    <Separator className="bg-border" />
    <div className={`${container} py-5`}>
      <p className="text-muted-foreground text-xs">{copyright}</p>
    </div>
  </footer>
);

export default Footer;
