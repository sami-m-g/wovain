import { Plus } from "lucide-react";

import type { Faq } from "@/content/types";

/** Questions as native disclosures: no JavaScript, keyboard and screen reader ready. */
export const FaqList = ({ items }: { items: Faq[] }) => (
  <div className="border-border border-t">
    {items.map((item) => (
      <details className="group border-border border-b" key={item.question}>
        <summary className="hover:text-foreground flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-base font-medium [&::-webkit-details-marker]:hidden">
          {item.question}
          <Plus
            aria-hidden="true"
            className="text-muted-foreground ease-out-expo size-4 shrink-0 transition-transform duration-300 group-open:rotate-45"
          />
        </summary>
        <p className="text-muted-foreground max-w-[65ch] pb-5 leading-relaxed">
          {item.answer}
        </p>
      </details>
    ))}
  </div>
);

/** FAQPage structured data for the same questions. */
export const faqJsonLd = (items: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((item) => ({
    "@type": "Question",
    acceptedAnswer: { "@type": "Answer", text: item.answer },
    name: item.question,
  })),
});
