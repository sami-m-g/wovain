import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@wovain/ui/components/card";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import {
  container,
  displayTitle,
  Eyebrow,
} from "@/components/marketing/section";

interface Connector {
  key: string;
  name: string;
  role: string;
  body: string;
  /** The service's own logo, as its brand guidelines draw it. */
  logo: ReactNode;
}

/** The accounts a merchant connects: shadcn/studio's integration cards with each service's logo. */
const AppIntegration = ({
  id,
  eyebrow,
  title,
  lead,
  link,
  connectors,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  link: { href: string; label: string };
  connectors: Connector[];
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className="bg-card border-border scroll-mt-20 border-y py-20 sm:py-28"
    id={id}
  >
    <div
      className={cn(
        container,
        "grid grid-cols-1 items-start gap-12 md:grid-cols-2 md:gap-16"
      )}
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={displayTitle} id={`${id}-title`}>
          {title}
        </h2>
        <p className="text-muted-foreground text-lg leading-relaxed">{lead}</p>
        <a
          className="text-accent-text inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
          href={link.href}
        >
          {link.label}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </a>
      </div>

      <ul className="flex flex-col gap-4">
        {connectors.map((connector) => (
          <li key={connector.key}>
            <Card className="bg-background ring-border rounded-xl shadow-none">
              <CardContent className="flex items-start gap-5 sm:items-center">
                <div className="border-border bg-card flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border px-3">
                  {connector.logo}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                    {connector.name}
                    <span className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
                      {connector.role}
                    </span>
                  </CardTitle>
                  <CardDescription className="leading-relaxed">
                    {connector.body}
                  </CardDescription>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default AppIntegration;
