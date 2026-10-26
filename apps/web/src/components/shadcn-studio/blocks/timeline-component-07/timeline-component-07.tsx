import { Badge } from "@wovain/ui/components/badge";
import { cn } from "@wovain/ui/lib/utils";

import {
  container,
  displayTitle,
  Eyebrow,
} from "@/components/marketing/section";
import { ProcessSteps } from "@/components/shadcn-studio/blocks/timeline-component-07/process-steps";

interface ProcessStep {
  /** Who acts at this step, shown as a chip: "You" or "wovain". */
  actor: string;
  /** True when the designer acts: the only chips dyed cochineal. */
  yours: boolean;
  title: string;
  body: string;
  detail: string;
}

const StepCard = ({ actor, yours, title, body, detail }: ProcessStep) => (
  <div className="flex flex-col gap-3">
    <Badge
      className={cn(
        "h-6 rounded-full px-2.5 text-xs font-medium",
        yours
          ? "bg-accent-soft text-accent-text"
          : "bg-muted text-muted-foreground"
      )}
      variant="secondary"
    >
      {actor}
    </Badge>
    <h3 className="font-display text-display-3 font-semibold">{title}</h3>
    <p className="text-muted-foreground max-w-[60ch] leading-relaxed">{body}</p>
    <p className="border-input max-w-[60ch] border-s border-dashed ps-4 text-sm leading-relaxed">
      {detail}
    </p>
  </div>
);

/** How a drop is made: shadcn/studio's scroll-drawn timeline, one row per step. */
const Process = ({
  id,
  eyebrow,
  title,
  lead,
  steps,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  steps: ProcessStep[];
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className="border-border scroll-mt-20 border-t py-20 sm:py-28"
    id={id}
  >
    <div
      className={cn(container, "grid gap-6 md:grid-cols-[5fr_7fr] md:gap-16")}
    >
      <div>
        <div className="flex flex-col gap-4 md:sticky md:top-28">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className={displayTitle} id={`${id}-title`}>
            {title}
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {lead}
          </p>
        </div>
      </div>
      <ProcessSteps
        items={steps.map((step, index) => ({
          content: <StepCard {...step} />,
          index: String(index + 1).padStart(2, "0"),
        }))}
      />
    </div>
  </section>
);

export default Process;
