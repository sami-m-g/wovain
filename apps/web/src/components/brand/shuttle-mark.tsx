"use client";

import { cn } from "@wovain/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { useId } from "react";

import { BRAND_NAME, SHUTTLE } from "@/brand/brand";

const EXPO_OUT = [0.16, 1, 0.3, 1] as const;
/** How far the shuttle darts in for the intro, in 48-grid units along its axis. */
const INTRO_RUN = 12;
/** Half of one loader pass, in 48-grid units along the axis. */
const PASS = 3.6;
const INTRO_SECONDS = 0.9;
const PASS_SECONDS = 0.7;
const PULSE_SECONDS = 0.8;

const along = (units: number) => ({
  x: SHUTTLE.axis.x * units,
  y: SHUTTLE.axis.y * units,
});

const LOOP: Transition = {
  duration: PASS_SECONDS,
  ease: "easeInOut",
  repeat: Number.POSITIVE_INFINITY,
  repeatType: "mirror",
};

const shuttleMotion = (
  state: "intro" | "loading" | "static",
  reduced: boolean
) => {
  if (state === "static") {
    return {};
  }
  // The server cannot read the visitor's setting, so it may render the full
  // intro's offset; the reduced branches pin x and y to rest explicitly so a
  // hydrated client never leaves the shuttle displaced.
  if (reduced) {
    return state === "intro"
      ? {
          animate: { opacity: 1, x: 0, y: 0 },
          initial: { opacity: 0, x: 0, y: 0 },
          transition: { duration: 0.2 },
        }
      : {
          animate: { opacity: [1, 0.55], x: 0, y: 0 },
          transition: { ...LOOP, duration: PULSE_SECONDS },
        };
  }
  if (state === "intro") {
    return {
      animate: { opacity: 1, x: 0, y: 0 },
      initial: { opacity: 0, ...along(-INTRO_RUN) },
      transition: { duration: INTRO_SECONDS, ease: EXPO_OUT },
    };
  }
  return {
    animate: {
      x: [along(-PASS).x, along(PASS).x],
      y: [along(-PASS).y, along(PASS).y],
    },
    transition: LOOP,
  };
};

const threadMotion = (
  state: "intro" | "loading" | "static",
  reduced: boolean
) => {
  if (state === "static") {
    return {};
  }
  if (reduced) {
    // Pin the full thread for the same reason as the shuttle's reduced branch.
    return { animate: { pathLength: 1 }, transition: { duration: 0 } };
  }
  if (state === "intro") {
    return {
      animate: { pathLength: 1 },
      initial: { pathLength: 0 },
      transition: { delay: 0.12, duration: INTRO_SECONDS, ease: EXPO_OUT },
    };
  }
  return { animate: { pathLength: [0.75, 1] }, transition: LOOP };
};

/**
 * The Shuttle drawn inline, so it can move: `intro` plays once (the shuttle
 * darts up its diagonal and the thread draws behind it), `loading` loops (the
 * shuttle passes back and forth like a pick across the cloth). Reduced motion
 * turns the intro into a fade and the loader into a slow pulse. Colours come
 * from the `--brand-mark-*` tokens, so the tile lifts on dark grounds.
 */
export const ShuttleMark = ({
  className,
  label = BRAND_NAME,
  size = 32,
  state = "static",
}: {
  className?: string;
  /** Accessible name; pass `null` when a visible label sits next to the mark. */
  label?: string | null;
  size?: number;
  state?: "intro" | "loading" | "static";
}) => {
  const clipId = useId();
  const reduced = useReducedMotion() ?? false;
  const labelled = label !== null;
  return (
    <svg
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? label : undefined}
      className={cn("shrink-0", className)}
      height={size}
      role={labelled ? "img" : undefined}
      viewBox="0 0 48 48"
      width={size}
    >
      <defs>
        <clipPath id={clipId}>
          <rect height="48" rx={SHUTTLE.tileRadius} width="48" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect fill="var(--brand-mark-tile)" height="48" width="48" />
        <motion.path
          d={SHUTTLE.thread}
          fill="none"
          stroke="var(--brand-mark-thread)"
          strokeWidth={SHUTTLE.threadWidth}
          {...threadMotion(state, reduced)}
        />
        <motion.path
          d={SHUTTLE.hull}
          fill="var(--brand-mark-shuttle)"
          fillRule="evenodd"
          {...shuttleMotion(state, reduced)}
        />
      </g>
    </svg>
  );
};

/** The mark as a loading state: an announced status with the passing shuttle. */
export const ShuttleLoader = ({
  className,
  label,
  size = 20,
}: {
  className?: string;
  label: string;
  size?: number;
}) => (
  <output className={cn("inline-flex", className)}>
    <ShuttleMark label={null} size={size} state="loading" />
    <span className="sr-only">{label}</span>
  </output>
);
