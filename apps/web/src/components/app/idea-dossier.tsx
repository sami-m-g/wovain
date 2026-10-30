"use client";

import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LINE_MAX, sentencesWithin } from "@wovain/core/evidence";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { Spinner } from "@wovain/ui/components/spinner";
import { FileSearch, RotateCcw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Citations } from "@/components/app/citations";
import type { IdeaDossierRecord } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// Tavily Research's dossier on one idea (the tavily-evidence flag): why now,
// how crowded, the price range and the risks, each with its sources. The
// merchant starts it; the card reads it back every few seconds until Tavily
// finishes. While the flag is off the server answers 404 and the card shows
// nothing; any other error offers a retry.

const POLL_MS = 5000;
const NOT_FOUND = 404;
const GLANCE_RISKS = 3;
const MAX_SOURCES = 6;

const isFlagOff = (error: unknown) =>
  error instanceof ORPCError && error.status === NOT_FOUND;

type DossierRecord = IdeaDossierRecord;
type Dossier = NonNullable<DossierRecord["dossier"]>;

const LEVEL_VARIANT = {
  high: "destructive",
  low: "secondary",
  medium: "outline",
} as const;

/** A report saved before the glance existed: whole sentences, never cut. */
const lineOf = (text: string) => sentencesWithin(text, LINE_MAX);

/** One labelled line of the report at a glance. */
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
    <dt className="text-muted-foreground text-xs font-medium sm:pt-0.5">
      {label}
    </dt>
    <dd className="text-sm text-pretty">{children}</dd>
  </div>
);

/** One answer of the full report. */
const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
    <dd>{children}</dd>
  </div>
);

const PriceRange = ({ band }: { band: Dossier["priceBand"] }) => {
  const format = useFormatter();
  const { highUsd, lowUsd } = band;
  if (lowUsd === undefined || highUsd === undefined) {
    return null;
  }
  const usd = (value: number) =>
    format.number(value, {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    });
  return (
    <span className="figures font-semibold">
      {usd(lowUsd)}–{usd(highUsd)}{" "}
    </span>
  );
};

/** The whole report, as Tavily wrote it, behind "Read full report". */
const FullReport = ({ dossier }: { dossier: Dossier }) => {
  const t = useTranslations("Wizard.evidence");
  const { priceBand, risks, saturation, whyNow } = dossier;
  return (
    <details className="text-sm">
      <summary className="text-accent-text w-fit cursor-pointer text-xs font-semibold underline-offset-4 hover:underline">
        {t("readFull")}
      </summary>
      <dl className="mt-3 flex max-w-[70ch] flex-col gap-3">
        <Fact label={t("whyNow")}>{whyNow}</Fact>
        {saturation === "" ? null : (
          <Fact label={t("saturation")}>{saturation}</Fact>
        )}
        {priceBand.note === "" ? null : (
          <Fact label={t("priceBand")}>
            <PriceRange band={priceBand} />
            {priceBand.note}
          </Fact>
        )}
        {risks.length > 0 ? (
          <Fact label={t("risks")}>
            <ul className="list-disc ps-4">
              {risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </Fact>
        ) : null}
      </dl>
    </details>
  );
};

/**
 * The report at a glance: why now, how crowded, the price band and the
 * risks, one line each, then the sources. The full text opens on request.
 */
export const DossierView = ({ dossier }: { dossier: Dossier }) => {
  const t = useTranslations("Wizard.evidence");
  const { citations, priceBand, risks, saturation, summary, whyNow } = dossier;
  const glance = {
    price: summary?.price || lineOf(priceBand.note),
    risks:
      summary === undefined || summary.risks.length === 0
        ? risks.slice(0, GLANCE_RISKS).map(lineOf)
        : summary.risks,
    saturation: summary?.saturation || lineOf(saturation),
    whyNow: summary?.whyNow || lineOf(whyNow),
  };
  const level = summary?.saturationLevel;
  return (
    <section aria-label={t("dossierTitle")} className="flex flex-col gap-3">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {t("dossierTitle")}
      </h4>
      <dl className="flex flex-col gap-2">
        <Row label={t("whyNow")}>{glance.whyNow}</Row>
        {glance.saturation === "" && level === undefined ? null : (
          <Row label={t("saturation")}>
            {level === undefined ? null : (
              <Badge
                className="me-2 align-middle"
                variant={LEVEL_VARIANT[level]}
              >
                {t(`level.${level}`)}
              </Badge>
            )}
            {glance.saturation}
          </Row>
        )}
        <Row label={t("priceBand")}>
          {/* The glance names its own prices; the range stands in without it. */}
          {summary?.price ? null : <PriceRange band={priceBand} />}
          {glance.price}
        </Row>
        {glance.risks.length > 0 ? (
          <Row label={t("risks")}>{glance.risks.join(" · ")}</Row>
        ) : null}
      </dl>
      <Citations citations={citations} max={MAX_SOURCES} />
      <FullReport dossier={dossier} />
    </section>
  );
};

const DossierStart = ({
  failed,
  ideaId,
  onStarted,
}: {
  failed: boolean;
  ideaId: string;
  onStarted: (record: DossierRecord) => void;
}) => {
  const t = useTranslations("Wizard.evidence");
  const start = useMutation(
    orpc.ideas.startDossier.mutationOptions({ onSuccess: onStarted })
  );
  const Icon = failed ? RotateCcw : FileSearch;
  return (
    <div className="flex flex-col gap-1 px-1">
      {failed ? (
        <p className="text-destructive text-xs">{t("dossierFailed")}</p>
      ) : null}
      <Button
        className="h-9 w-fit"
        disabled={start.isPending}
        onClick={() => start.mutate({ ideaId })}
        variant="outline"
      >
        <Icon aria-hidden="true" data-icon="inline-start" />
        {failed ? t("dossierRetry") : t("dossierStart")}
      </Button>
      {start.isError ? (
        <p className="text-destructive text-xs" role="alert">
          {start.error.message}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">{t("dossierHint")}</p>
    </div>
  );
};

export const IdeaDossier = ({
  automatic = false,
  fallback,
  ideaId,
}: {
  // Started by the server (an idea picked on the Home): no start button,
  // only a retry if it failed.
  automatic?: boolean;
  // What the page shows in the report's place until it is done: the idea's
  // own why-now and sources, so they are never shown next to the report's.
  fallback?: ReactNode;
  ideaId: string;
}) => {
  const t = useTranslations("Wizard.evidence");
  const queryClient = useQueryClient();
  const options = orpc.ideas.dossier.queryOptions({ input: { ideaId } });
  const dossier = useQuery({
    ...options,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? POLL_MS : false,
    retry: false,
  });

  // Loading, or the flag is off (404): nothing to show.
  if (dossier.isPending || isFlagOff(dossier.error)) {
    return fallback ?? null;
  }
  // A failed poll keeps the last answer on screen; with no answer at all the
  // merchant gets a retry.
  const record = dossier.data;
  if (automatic && record === null) {
    return fallback ?? null;
  }
  if (record === undefined || record === null || record.status === "failed") {
    return (
      <>
        {fallback}
        <DossierStart
          failed={record === undefined || record?.status === "failed"}
          ideaId={ideaId}
          onStarted={(started) =>
            queryClient.setQueryData(options.queryKey, started)
          }
        />
      </>
    );
  }
  if (record.dossier === undefined) {
    return (
      <>
        {fallback}
        <p
          aria-live="polite"
          className="text-muted-foreground flex items-center gap-2 px-1 text-xs"
        >
          <Spinner aria-hidden="true" />
          {t("dossierPending")}
        </p>
      </>
    );
  }
  return <DossierView dossier={record.dossier} />;
};
