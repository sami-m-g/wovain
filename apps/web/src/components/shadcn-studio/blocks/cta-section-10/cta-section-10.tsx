import { buttonVariants } from "@wovain/ui/components/button";
import { Card, CardContent } from "@wovain/ui/components/card";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";

import { CtaLink } from "@/components/marketing/cta-link";
import { container, displayTitle } from "@/components/marketing/section";
import { Link } from "@/i18n/navigation";

/** The closing call to action: shadcn/studio's CTA band, in plum ink. */
const CTASection = ({
  id,
  title,
  body,
  primary,
  secondary,
}: {
  id: string;
  title: string;
  body: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className="bg-foreground text-background"
  >
    <div className={cn(container, "py-16 sm:py-24")}>
      <Card className="text-background rounded-none bg-transparent py-0 shadow-none ring-0">
        <CardContent className="flex justify-between gap-8 px-0 max-lg:flex-col lg:items-end">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className={displayTitle} id={`${id}-title`}>
              {title}
            </h2>
            <p className="max-w-[55ch] text-lg leading-relaxed opacity-80">
              {body}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CtaLink
              className={cn(
                buttonVariants(),
                "bg-background text-foreground hover:bg-background/90 h-12 rounded-xl px-6 text-[0.95rem]"
              )}
              cta="closing-sign-up"
              href={primary.href}
              prefetch={false}
            >
              {primary.label}
              <ArrowRight
                aria-hidden="true"
                className="rtl:rotate-180"
                data-icon="inline-end"
              />
            </CtaLink>
            <Link
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "text-background hover:bg-background/10 hover:text-background h-12 rounded-xl px-5 text-[0.95rem] underline-offset-4 hover:underline"
              )}
              href={secondary.href}
            >
              {secondary.label}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
);

export default CTASection;
