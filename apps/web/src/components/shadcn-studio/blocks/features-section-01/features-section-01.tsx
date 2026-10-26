import { BlurFade } from "@wovain/ui/components/blur-fade";
import { Card, CardContent } from "@wovain/ui/components/card";

import {
  container,
  displayTitle,
  Eyebrow,
} from "@/components/marketing/section";

/** Seconds between cards as they reveal on scroll. */
const REVEAL_STAGGER = 0.06;

export interface Outcome {
  title: string;
  body: string;
}

/**
 * What a designer gets: shadcn/studio's features grid, numbered like a spec
 * sheet instead of an icon per card.
 */
const Features = ({
  id,
  eyebrow,
  title,
  lead,
  outcomes,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  outcomes: Outcome[];
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className="scroll-mt-20 py-20 sm:py-28"
    id={id}
  >
    <div className={container}>
      <div className="mb-12 flex max-w-2xl flex-col gap-4 sm:mb-16">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={displayTitle} id={`${id}-title`}>
          {title}
        </h2>
        <p className="text-muted-foreground text-lg leading-relaxed">{lead}</p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {outcomes.map((outcome, index) => (
          <li className="flex" key={outcome.title}>
            <BlurFade
              className="flex flex-1"
              delay={index * REVEAL_STAGGER}
              direction="up"
              inView
              offset={12}
            >
              <Card className="ring-border hover:ring-foreground/30 flex-1 rounded-xl text-base shadow-none transition-shadow duration-200">
                <CardContent className="flex flex-col gap-3 p-1 sm:p-2">
                  <span className="text-muted-foreground figures border-border border-b border-dashed pb-3 text-xs font-medium">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-xl font-semibold tracking-[-0.02em]">
                    {outcome.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {outcome.body}
                  </p>
                </CardContent>
              </Card>
            </BlurFade>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default Features;
