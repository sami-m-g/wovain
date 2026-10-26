"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** The expo ease-out from DESIGN.md, as Motion's cubic-bezier array. */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Public pages' motion: the brand ease, and none when the visitor asks for less. */
export const MotionProvider = ({ children }: { children: ReactNode }) => (
  <MotionConfig
    reducedMotion="user"
    transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
  >
    {children}
  </MotionConfig>
);
