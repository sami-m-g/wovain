"use client";

import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@wovain/api/routers/index";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Spinner } from "@wovain/ui/components/spinner";
import {
  Bot,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Radar,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { Link } from "@/i18n/navigation";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

type Outputs = InferRouterOutputs<AppRouter>;
type Log = Outputs["autopilot"]["log"];
type Suggestion = Log["suggestions"][number];
type TraceStep = Log["scans"][number];
type Status = Extract<Outputs["autopilot"]["status"], { enabled: true }>;

const SOURCES_SHOWN = 4;
const RUN_PATH = "/dashboard/new";

const text = (value: unknown) =>
  typeof value === "string" ? value : String(value ?? "");
const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);

type Narrator = ReturnType<typeof useTranslations<"Autopilot.steps">>;
type Output = Record<string, unknown>;

const qlooSentence = (t: Narrator, entry: TraceStep, output: Output) => {
  if (!entry.ok) {
    return t("qlooFailed");
  }
  const rising = Array.isArray(output["rising"])
    ? (output["rising"] as { name?: unknown }[])
    : [];
  return rising.length === 0
    ? t("qlooNone")
    : t("qlooRising", {
        names: rising.map(({ name }) => text(name)).join(", "),
      });
};

const policySentence = (t: Narrator, output: Output) => {
  if (output["entitled"] === false) {
    return t("notEntitled");
  }
  if (output["verdict"] === "allow") {
    return t("policyAllow");
  }
  return output["verdict"] === "deny" ? t("policyDeny") : t("policyWait");
};

const runSentence = (t: Narrator, entry: TraceStep, output: Output) => {
  if (!entry.ok) {
    return t("runFailed", { error: text(output["error"]) });
  }
  return output["mode"] === "autopilot" ? t("runAutopilot") : t("runIdeas");
};

/** One sentence for a decision trace step, from what it recorded. */
const useNarrate = () => {
  const t = useTranslations("Autopilot.steps");
  return (entry: TraceStep): string => {
    const output = entry.output ?? {};
    switch (entry.step) {
      case "scan": {
        return t("scan", { input: entry.inputSummary });
      }
      case "qloo.rising": {
        return qlooSentence(t, entry, output);
      }
      case "tavily.news": {
        return entry.ok
          ? t("tavily", {
              count: Number(output["kept"] ?? 0),
              query: entry.inputSummary,
            })
          : t("tavilyFailed", { query: entry.inputSummary });
      }
      case "match": {
        return t("match", { count: count(output["matched"]) });
      }
      case "suggest": {
        return t("suggest", { subject: entry.inputSummary });
      }
      case "policy": {
        return policySentence(t, output);
      }
      case "credit_cap": {
        return t("creditCap", {
          cap: Number(output["cap"] ?? 0),
          used: Number(output["used"] ?? 0),
        });
      }
      case "run.start": {
        return runSentence(t, entry, output);
      }
      default: {
        return t("other", { step: entry.step });
      }
    }
  };
};

const Steps = ({ steps }: { steps: TraceStep[] }) => {
  const narrate = useNarrate();
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {steps.map((entry) => {
        const Icon = entry.ok ? CircleCheck : CircleAlert;
        return (
          <li
            className="flex items-start gap-2"
            key={`${entry.at}-${entry.step}-${entry.inputSummary}`}
          >
            <Icon
              aria-hidden="true"
              className={
                entry.ok
                  ? "text-muted-foreground mt-0.5 size-4 shrink-0"
                  : "text-destructive mt-0.5 size-4 shrink-0"
              }
            />
            <span>{narrate(entry)}</span>
          </li>
        );
      })}
    </ol>
  );
};

const Sources = ({ sources }: { sources: Suggestion["sources"] }) => {
  const t = useTranslations("Autopilot");
  const shown = sources.slice(0, SOURCES_SHOWN);
  if (shown.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-muted-foreground text-xs font-medium uppercase">
        {t("evidence")}
      </h3>
      <ul className="flex flex-col gap-1 text-sm">
        {shown.map((source) => (
          <li
            key={`${source.provider}-${source.id ?? source.url ?? source.title}`}
          >
            {source.url === undefined ? (
              <span>
                <Badge className="me-2" variant="outline">
                  {source.provider === "qloo" ? "Qloo" : source.provider}
                </Badge>
                {source.title}
              </span>
            ) : (
              <a
                className="hover:text-foreground text-muted-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                {source.title ?? source.url}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const SuggestionCard = ({ item }: { item: Suggestion }) => {
  const t = useTranslations("Autopilot");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: orpc.autopilot.key() });
  };
  const onError = (error: Error) => {
    toast.error(t("actionFailed", { message: error.message }));
  };
  const accept = useMutation(
    orpc.autopilot.accept.mutationOptions({ onError, onSuccess: refresh })
  );
  const dismiss = useMutation(
    orpc.autopilot.dismiss.mutationOptions({ onError, onSuccess: refresh })
  );
  const busy = accept.isPending || dismiss.isPending;
  const open = item.status === "new";

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.trigger === "qloo" ? "default" : "secondary"}>
              {item.trigger === "qloo"
                ? t("triggers.qloo")
                : t("triggers.trend")}
            </Badge>
            <Badge variant="outline">{t(`statuses.${item.status}`)}</Badge>
            {item.approval === null ? null : (
              <Badge variant="outline">
                <Bot aria-hidden="true" className="size-3.5" />
                {t(`approvals.${item.approval.status}`)}
              </Badge>
            )}
            <time
              className="text-muted-foreground figures ms-auto text-xs"
              dateTime={item.createdAt}
            >
              {format.dateTime(new Date(item.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </div>
          <CardTitle className="font-display text-lg">{item.title}</CardTitle>
          <CardDescription>{item.rationale}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Sources sources={item.sources} />
          {item.steps.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground text-xs font-medium uppercase">
                {t("log")}
              </h3>
              <Steps steps={item.steps} />
            </div>
          ) : null}
        </CardContent>
        {open || item.runId !== null ? (
          <CardFooter className="flex flex-wrap gap-2">
            {open ? (
              <>
                <Button
                  disabled={busy}
                  onClick={() => accept.mutate({ suggestionId: item.id })}
                >
                  {accept.isPending ? <Spinner /> : null}
                  {t("accept")}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => dismiss.mutate({ suggestionId: item.id })}
                  variant="ghost"
                >
                  {t("dismiss")}
                </Button>
              </>
            ) : null}
            {item.runId === null ? null : (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={{ pathname: RUN_PATH, query: { run: item.runId } }}
              >
                {t("openRun")}
              </Link>
            )}
          </CardFooter>
        ) : null}
      </Card>
    </li>
  );
};

const Settings = ({ status }: { status: Status }) => {
  const t = useTranslations("Autopilot");
  const { autonomy, credits } = status;
  return (
    <div className="border-border bg-card flex flex-col gap-1.5 rounded-xl border p-4 text-sm">
      <p className="font-medium">{t(`levels.${autonomy.level}`)}</p>
      <p className="text-muted-foreground">
        {autonomy.paused ? t("paused") : t(`levelHints.${autonomy.level}`)}
      </p>
      <p className="text-muted-foreground figures">
        {t("credits", {
          cap: credits.cap,
          estimate: credits.estimate,
          used: credits.usedToday,
        })}
      </p>
      {status.entitled ? null : (
        <p className="text-muted-foreground">{t("notEntitled")}</p>
      )}
      {status.hasBrand ? null : (
        <p className="text-muted-foreground">{t("noBrand")}</p>
      )}
    </div>
  );
};

const ScanButton = () => {
  const t = useTranslations("Autopilot");
  const scan = useMutation(
    orpc.autopilot.scan.mutationOptions({
      onError: () => {
        toast.error(t("scanFailed"));
      },
      onSuccess: () => {
        toast.success(t("scanRequested"));
      },
    })
  );
  return (
    <Button
      disabled={scan.isPending}
      onClick={() => scan.mutate({})}
      variant="outline"
    >
      {scan.isPending ? <Spinner /> : <Radar aria-hidden="true" />}
      {t("scanNow")}
    </Button>
  );
};

const QuietScans = ({ scans }: { scans: TraceStep[] }) => {
  const t = useTranslations("Autopilot");
  const format = useFormatter();
  if (scans.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-base font-semibold">{t("scans")}</h2>
      <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
        {scans.map((scan) => (
          <li key={scan.at}>
            <time className="figures me-2" dateTime={scan.at}>
              {format.dateTime(new Date(scan.at), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
            {t("scanNothing", { count: count(scan.output?.["matched"]) })}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** The narrated decision log: suggestions, their evidence and what autopilot did. */
export const AutopilotLog = () => {
  const t = useTranslations("Autopilot");
  const status = useQuery(orpc.autopilot.status.queryOptions());
  const enabled = status.data?.enabled === true;
  const log = useQuery({
    ...orpc.autopilot.log.queryOptions(),
    enabled,
  });

  if (status.isPending || (enabled && log.isPending)) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }
  const error = status.error ?? log.error;
  if (error !== null) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }
  if (status.data?.enabled !== true) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  const suggestions = log.data?.suggestions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Settings status={status.data} />
        <ScanButton />
      </div>
      {suggestions.length === 0 ? (
        <Empty className="border-border border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("empty")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {suggestions.map((item) => (
            <SuggestionCard item={item} key={item.id} />
          ))}
        </ul>
      )}
      <QuietScans scans={log.data?.scans ?? []} />
    </div>
  );
};
