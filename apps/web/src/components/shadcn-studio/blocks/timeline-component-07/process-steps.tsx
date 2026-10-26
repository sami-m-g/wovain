"use client";

import { TimelineAnimate } from "@wovain/ui/components/timeline-animate";
import type { TimelineAnimateEntry } from "@wovain/ui/components/timeline-animate";
import { useReducedMotion } from "motion/react";

/**
 * The steps as the block's scroll-drawn timeline, or, when the visitor asks
 * for reduced motion, the same rows drawn still: the vendored timeline drives
 * its fade and lift from scroll position, which MotionConfig can't switch off.
 */
export const ProcessSteps = ({ items }: { items: TimelineAnimateEntry[] }) => {
  const reduced = useReducedMotion();
  if (!reduced) {
    return <TimelineAnimate className="-mt-10 sm:-mt-20" data={items} />;
  }
  return (
    <ol className="flex flex-col gap-10 sm:gap-16">
      {items.map((item) => (
        <li
          className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4.5rem_1fr]"
          key={item.index}
        >
          <span className="text-muted-foreground figures text-lg font-semibold sm:text-xl">
            {item.index}
          </span>
          <div className="min-w-0">{item.content}</div>
        </li>
      ))}
    </ol>
  );
};
