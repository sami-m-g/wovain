"use client";

import { posthog } from "posthog-js";
import type { ComponentProps } from "react";

import { Link } from "@/i18n/navigation";

// A landing call to action: a Link that records the top of the funnel in
// PostHog as landing_cta_clicked, with which CTA it was.
export const CtaLink = ({
  cta,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { cta: string }) => (
  <Link
    {...props}
    onClick={(event) => {
      posthog.capture("landing_cta_clicked", { cta });
      onClick?.(event);
    }}
  />
);
