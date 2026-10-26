"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * The app's motion defaults: the expo ease-out from the design tokens at a
 * quick UI duration, and the visitor's reduced-motion setting, which turns
 * transform animations off and keeps the opacity fades.
 */
export const AppMotion = ({ children }: { children: ReactNode }) => (
  <MotionConfig
    reducedMotion="user"
    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </MotionConfig>
);
