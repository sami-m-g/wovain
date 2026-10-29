"use client";

import { useQuery } from "@tanstack/react-query";
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
import { CircleAlert, Lightbulb, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectState, useConnectable } from "@/components/app/connect-state";
import { ProviderLogo } from "@/components/app/provider-logo";
import { STEP_TITLE_ID } from "@/components/app/wizard-parts";
import type { Stage } from "@/components/product/run-tape";
import { Link } from "@/i18n/navigation";
import type { Provider, RunFailure } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const FAILURE_COPY = {
  no_ideas: "noIdeas",
  other: "other",
  rejected: "rejected",
} as const;

// Briefs Qloo's taste graph knows: a band, a film, a brand and a place.
const QLOO_EXAMPLES = [
  "Tame Impala",
  "Studio Ghibli",
  "Patagonia",
  "Tokyo",
] as const;

/**
 * Shown when Qloo matched nothing in the brief (QLOO_NO_MATCH). Every idea
 * is a Qloo tag, so trying the same brief again can't help: it suggests
 * naming something Qloo knows, with examples that start a new brief.
 */
const QlooNoMatchState = ({ onRestart }: { onRestart: () => void }) => {
  const t = useTranslations("Wizard.qlooNoMatch");
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle id={STEP_TITLE_ID}>{t("title")}</EmptyTitle>
        <EmptyDescription>{t("body")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <p className="text-muted-foreground text-xs">{t("examples")}</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {QLOO_EXAMPLES.map((example) => (
            <li key={example}>
              <Link
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" }),
                  "h-8"
                )}
                href={`/dashboard/new?brief=${encodeURIComponent(example)}`}
              >
                {example}
              </Link>
            </li>
          ))}
        </ul>
        <Button className="h-9 px-4" onClick={onRestart}>
          {t("another")}
        </Button>
      </EmptyContent>
    </Empty>
  );
};

interface Actions {
  retrying: boolean;
  onRetry: () => void;
  onRestart: () => void;
}

const StepTitle = ({ children }: { children: string }) => (
  <h2 id={STEP_TITLE_ID}>{children}</h2>
);

/** "Try again": a fresh run from the same brief. */
const RetryButton = ({ retrying, onRetry }: Actions) => {
  const t = useTranslations("Wizard.failed");
  return (
    <Button className="h-9 px-4" disabled={retrying} onClick={onRetry}>
      {retrying ? t("retrying") : t("retry")}
    </Button>
  );
};

/** "Write a new brief": the quiet way out of any failed run. */
const RestartButton = ({ retrying, onRestart }: Actions) => {
  const t = useTranslations("Wizard.failed");
  return (
    <Button
      className="h-9 px-4"
      disabled={retrying}
      onClick={onRestart}
      variant="ghost"
    >
      {t("another")}
    </Button>
  );
};

/**
 * The run stopped because a provider isn't connected: connect it here, and
 * once it is, try the drop again in one click.
 */
const ConnectToFinish = ({
  stage,
  provider,
  reconnect,
  actions,
}: {
  stage: Stage;
  provider: Provider;
  reconnect: boolean;
  actions: Actions;
}) => {
  const t = useTranslations("Wizard.failed");
  const names = useTranslations("Connections.providers");
  const stages = useTranslations("Stages");
  const connections = useQuery(orpc.connections.list.queryOptions());
  const service = names(`${provider}.name`);
  const nowConnected =
    connections.data?.some(
      (each) => each.provider === provider && !each.needsReconnect
    ) === true;

  if (nowConnected) {
    return (
      <Empty className="border-input bg-card border border-dashed">
        <EmptyHeader>
          <EmptyMedia>
            <ProviderLogo className="size-12" service={provider} />
          </EmptyMedia>
          <EmptyTitle className="font-display text-base font-semibold">
            <StepTitle>{t("connectedTitle", { service })}</StepTitle>
          </EmptyTitle>
          <EmptyDescription>{t("connectedBody")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          <RetryButton {...actions} />
          <RestartButton {...actions} />
        </EmptyContent>
      </Empty>
    );
  }

  const where = { service, stage: stages(stage) };
  return (
    <ConnectState
      body={t(reconnect ? "reconnectBody" : "connectBody", where)}
      headingId={STEP_TITLE_ID}
      provider={provider}
      reconnect={reconnect}
      title={t(reconnect ? "reconnectTitle" : "connectTitle", where)}
    >
      <RestartButton {...actions} />
    </ConnectState>
  );
};

/**
 * Shown in place of any step when the run has failed: which step stopped, why
 * in plain words, and what to do next (connect a missing service, try the
 * drop again, or write a new brief). A missing connection is a connect
 * state, not an error.
 */
export const RunFailedState = ({
  stage,
  failure,
  ...actions
}: Actions & {
  stage: Stage;
  failure: RunFailure;
}) => {
  const t = useTranslations("Wizard.failed");
  const stages = useTranslations("Stages");
  const missing = failure.reason === "not_connected" ? failure : undefined;
  // fal while wovain draws the art: nothing for the merchant to connect.
  const connectable = useConnectable(missing?.service ?? "fourthwall");

  if (missing !== undefined && connectable) {
    return (
      <ConnectToFinish
        actions={actions}
        provider={missing.service}
        reconnect={missing.reconnect === true}
        stage={stage}
      />
    );
  }

  const { onRestart } = actions;
  if (failure.reason === "qloo_no_match") {
    return <QlooNoMatchState onRestart={onRestart} />;
  }

  const reason = failure.reason === "not_connected" ? "other" : failure.reason;
  return (
    <div className="flex flex-col items-start gap-5">
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>
          <StepTitle>{t("title", { stage: stages(stage) })}</StepTitle>
        </AlertTitle>
        <AlertDescription>
          {t(FAILURE_COPY[reason])}
          {failure.reason === "other" && failure.message ? (
            <span className="text-muted-foreground mt-1 block text-xs">
              {t("details", { message: failure.message })}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <RetryButton {...actions} />
        <RestartButton {...actions} />
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
