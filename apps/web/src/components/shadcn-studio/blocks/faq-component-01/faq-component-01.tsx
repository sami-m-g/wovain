import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wovain/ui/components/accordion";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";

import {
  container,
  displayTitle,
  Eyebrow,
} from "@/components/marketing/section";
import type { Faq } from "@/content/types";

/** Questions as shadcn/studio's accordion FAQ, headline on the left. */
const FAQ = ({
  id,
  eyebrow,
  title,
  lead,
  more,
  items,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  more: { href: string; label: string };
  items: Faq[];
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className="border-border scroll-mt-20 border-t py-20 sm:py-28"
    id={id}
  >
    <div
      className={cn(container, "grid gap-10 md:grid-cols-[5fr_7fr] md:gap-16")}
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={displayTitle} id={`${id}-title`}>
          {title}
        </h2>
        <p className="text-muted-foreground text-lg leading-relaxed">{lead}</p>
        <a
          className="text-accent-text inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
          href={more.href}
        >
          {more.label}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </a>
      </div>

      <Accordion className="border-border w-full border-t">
        {items.map((item) => (
          <AccordionItem
            className="border-border border-b"
            key={item.question}
            value={item.question}
          >
            <AccordionTrigger className="min-h-14 items-center py-4 text-base hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground max-w-[65ch] pb-5 text-base leading-relaxed">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

export default FAQ;
