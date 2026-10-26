"use client";

import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Spinner } from "@wovain/ui/components/spinner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export const STEP_TITLE_ID = "wizard-step-title";

/** Step heading; takes focus when the step appears so keyboard and screen reader users follow along. */
export const StepHeader = ({
  title,
  lead,
  focusOnMount = true,
}: {
  title: string;
  lead?: string | undefined;
  focusOnMount?: boolean | undefined;
}) => {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) {
      ref.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <div className="flex flex-col gap-2">
      <h2
        className="font-display text-xl font-semibold tracking-[-0.02em] outline-none"
        id={STEP_TITLE_ID}
        ref={ref}
        tabIndex={-1}
      >
        {title}
      </h2>
      {lead ? (
        <p className="text-muted-foreground max-w-[65ch]">{lead}</p>
      ) : null}
    </div>
  );
};

/** Primary forward action with the arrow that flips in right-to-left languages. */
export const NextButton = ({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
  type?: "button" | "submit";
}) => (
  <Button
    className="h-9 rounded-lg px-4"
    disabled={disabled}
    onClick={onClick}
    type={type}
  >
    {children}
    <ArrowRight
      aria-hidden="true"
      className="rtl:rotate-180"
      data-icon="inline-end"
    />
  </Button>
);

/** Footer of a step: busy indicator, Back, and the step's forward action. */
export const StepActions = ({
  children,
  busyLabel,
  onBack,
}: {
  children: ReactNode;
  busyLabel?: string | undefined;
  onBack?: (() => void) | undefined;
}) => {
  const t = useTranslations("Wizard");
  return (
    <div className="border-border flex flex-col gap-4 border-t pt-5">
      {busyLabel ? (
        <div aria-hidden="true" className="flex items-center gap-3">
          <Spinner className="text-primary" />
          <span className="text-sm font-medium">{busyLabel}</span>
          <Skeleton className="h-2 flex-1" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {onBack ? (
          <Button
            className="h-9 rounded-lg px-3"
            disabled={Boolean(busyLabel)}
            onClick={onBack}
            variant="ghost"
          >
            <ArrowLeft
              aria-hidden="true"
              className="rtl:rotate-180"
              data-icon="inline-start"
            />
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {children}
      </div>
    </div>
  );
};
