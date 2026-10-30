"use client";

import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const isFlagOff = (error: unknown) =>
  error instanceof ORPCError && error.status === NOT_FOUND;

type DossierRecord = IdeaDossierRecord;
type Dossier = NonNullable<DossierRecord["dossier"]>;

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{children}</dd>
  </div>
);

const PriceBand = ({ band }: { band: Dossier["priceBand"] }) => {
  const format = useFormatter();
  const usd = (value: number) =>
    format.number(value, {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    });
  const { highUsd, lowUsd, note } = band;
  return (
    <>
      {lowUsd !== undefined && highUsd !== undefined ? (
        <span className="figures font-semibold">
          {usd(lowUsd)}–{usd(highUsd)}{" "}
        </span>
      ) : null}
      {note}
    </>
  );
};

const DossierView = ({ dossier }: { dossier: Dossier }) => {
  const t = useTranslations("Wizard.evidence");
  const { citations, priceBand, risks, saturation, whyNow } = dossier;
  return (
    <section
      aria-label={t("dossierTitle")}
      className="bg-muted flex flex-col gap-2 rounded-md p-3 text-xs"
    >
      <h4 className="font-semibold">{t("dossierTitle")}</h4>
      <dl className="flex flex-col gap-2">
        <Fact label={t("whyNow")}>{whyNow}</Fact>
        {saturation === "" ? null : (
          <Fact label={t("saturation")}>{saturation}</Fact>
        )}
        <Fact label={t("priceBand")}>
          <PriceBand band={priceBand} />
        </Fact>
        {risks.length > 0 ? (
          <Fact label={t("risks")}>
            <ul className="list-disc pl-4">
              {risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </Fact>
        ) : null}
      </dl>
      <Citations citations={citations} max={8} />
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
  ideaId,
}: {
  // Started by the server (an idea picked on the Home): no start button,
  // only a retry if it failed.
  automatic?: boolean;
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
    return null;
  }
  // A failed poll keeps the last answer on screen; with no answer at all the
  // merchant gets a retry.
  const record = dossier.data;
  if (automatic && record === null) {
    return null;
  }
  if (record === undefined || record === null || record.status === "failed") {
    return (
      <DossierStart
        failed={record === undefined || record?.status === "failed"}
        ideaId={ideaId}
        onStarted={(started) =>
          queryClient.setQueryData(options.queryKey, started)
        }
      />
    );
  }
  if (record.dossier === undefined) {
    return (
      <p
        aria-live="polite"
        className="text-muted-foreground flex items-center gap-2 px-1 text-xs"
      >
        <Spinner aria-hidden="true" />
        {t("dossierPending")}
      </p>
    );
  }
  return <DossierView dossier={record.dossier} />;
};
