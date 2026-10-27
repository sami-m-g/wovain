"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wovain/ui/components/alert";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { cn } from "@wovain/ui/lib/utils";
import { CircleAlert, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";

import { STEP_TITLE_ID } from "@/components/app/wizard-parts";
import type { Stage } from "@/components/product/run-tape";
import { Link } from "@/i18n/navigation";
import type { RunFailure } from "@/lib/flow-client";

const SERVICE_NAMES = {
  fal: "fal",
  fourthwall: "Fourthwall",
  meta: "Meta",
} as const;

const FAILURE_COPY = {
  no_ideas: "noIdeas",
  not_connected: "notConnected",
  other: "other",
  rejected: "rejected",
} as const;

/**
 * Shown in place of any step when the run has failed: which step stopped, why
 * in plain words, and what to do next (connect a missing service, try the
 * drop again, or write a new brief).
 */
export const RunFailedState = ({
  stage,
  failure,
  retrying,
  onRetry,
  onRestart,
}: {
  stage: Stage;
  failure: RunFailure;
  retrying: boolean;
  onRetry: () => void;
  onRestart: () => void;
}) => {
  const t = useTranslations("Wizard.failed");
  const stages = useTranslations("Stages");
  const service =
    failure.reason === "not_connected" ? SERVICE_NAMES[failure.service] : "";
  return (
    <div className="flex flex-col items-start gap-5">
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>
          <h2 id={STEP_TITLE_ID}>{t("title", { stage: stages(stage) })}</h2>
        </AlertTitle>
        <AlertDescription>
          {t(FAILURE_COPY[failure.reason], { service })}
          {failure.reason === "other" && failure.message ? (
            <span className="text-muted-foreground mt-1 block text-xs">
              {t("details", { message: failure.message })}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        {failure.reason === "not_connected" ? (
          <Link
            className={cn(buttonVariants(), "h-9 px-4")}
            href="/dashboard/connections"
          >
            {t("connect", { service })}
          </Link>
        ) : null}
        <Button
          className="h-9 px-4"
          disabled={retrying}
          onClick={onRetry}
          variant={failure.reason === "not_connected" ? "outline" : "default"}
        >
          {retrying ? t("retrying") : t("retry")}
        </Button>
        <Button
          className="h-9 px-4"
          disabled={retrying}
          onClick={onRestart}
          variant="ghost"
        >
          {t("another")}
        </Button>
      </div>
    </div>
  );
};

/**
 * Shown instead of an empty "Pick the ideas" list when research finished with
 * no ideas.
 */
export const NoIdeasState = ({
  retrying,
  onRetry,
  onRestart,
}: {
  retrying: boolean;
  onRetry: () => void;
  onRestart: () => void;
}) => {
  const t = useTranslations("Wizard.noIdeas");
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lightbulb aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle id={STEP_TITLE_ID}>{t("title")}</EmptyTitle>
        <EmptyDescription>{t("body")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button className="h-9 px-4" disabled={retrying} onClick={onRetry}>
          {t("retry")}
        </Button>
        <Button
          className="h-9 px-4"
          disabled={retrying}
          onClick={onRestart}
          variant="ghost"
        >
          {t("another")}
        </Button>
      </EmptyContent>
    </Empty>
  );
};
