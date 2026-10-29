"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { CampaignRules } from "@/components/app/campaign-rules";
import { ConnectState } from "@/components/app/connect-state";
import type { Campaign } from "@/lib/flow-client";
import { missingConnection } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

/**
 * Start, pause and refresh a staged Meta campaign from wovain (openspec
 * change media-buying-live). Starting only asks: the merchant approves the
 * daily spend here, the approval queue checks their caps, and the campaign
 * goes live on Meta after that. Hidden while the media-buying-live flag is
 * off, so the card keeps its Ads Manager link only.
 */

const CENTS = 100;
const STARTABLE = new Set(["draft", "paused"]);
// Every status that may still deliver, including "with_issues" (some ads
// can still spend) and "unknown": only draft, paused and archived can't.
const CANNOT_SPEND = new Set(["draft", "paused", "archived"]);

type Status = Campaign["status"];

export const CampaignControls = ({ campaign }: { campaign: Campaign }) => {
  const t = useTranslations("Wizard.done.media");
  const format = useFormatter();
  const live = useQuery(orpc.campaigns.liveBuying.queryOptions());
  const [status, setStatus] = useState<Status>(campaign.status);
  // One request ID per attempt, so a double click asks once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const renew = () => setRequestId(crypto.randomUUID());
  const ask = useMutation(orpc.campaigns.activate.mutationOptions());
  const decide = useMutation(orpc.approvals.decide.mutationOptions());
  const pause = useMutation(orpc.campaigns.pause.mutationOptions());
  const sync = useMutation(orpc.campaigns.sync.mutationOptions());

  if (live.data?.available !== true) {
    return null;
  }

  const budget = format.number(campaign.dailyBudgetCents / CENTS, {
    currency: "USD",
    style: "currency",
  });
  const busy =
    ask.isPending || decide.isPending || pause.isPending || sync.isPending;

  const onStart = async () => {
    setNotice(null);
    const approval = await ask.mutateAsync({
      campaignId: campaign.id,
      requestId,
    });
    renew();
    if (approval.status === "pending") {
      setPendingId(approval.id);
    } else if (approval.status === "denied") {
      setNotice(t("overCap"));
    }
  };

  const onDecide = async (approve: boolean) => {
    if (pendingId === null) {
      return;
    }
    await decide.mutateAsync({ approvalId: pendingId, approve });
    setPendingId(null);
    if (approve) {
      setStatus("publishing");
      setNotice(t("starting"));
    }
  };

  const onPause = async () => {
    setNotice(null);
    const done = await pause.mutateAsync({
      campaignId: campaign.id,
      requestId,
    });
    renew();
    if (done.status === "failed") {
      setNotice(t("failed", { reason: done.error ?? "" }));
      return;
    }
    setStatus("paused");
  };

  const onRefresh = async () => {
    const row = await sync.mutateAsync({ campaignId: campaign.id });
    setStatus(row.status);
  };

  const failure = ask.error ?? decide.error ?? pause.error ?? sync.error;
  const missing = missingConnection(failure);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={status === "active" ? "default" : "secondary"}>
          {t(`status.${status}`)}
        </Badge>
        {STARTABLE.has(status) && pendingId === null ? (
          <Button
            className="h-9 px-4"
            disabled={busy}
            onClick={() => {
              void onStart();
            }}
          >
            {t("start")}
          </Button>
        ) : null}
        {CANNOT_SPEND.has(status) ? null : (
          <Button
            className="h-9 px-4"
            disabled={busy}
            onClick={() => {
              void onPause();
            }}
            variant="outline"
          >
            {t("pause")}
          </Button>
        )}
        <Button
          className="h-9 px-4"
          disabled={busy}
          onClick={() => {
            void onRefresh();
          }}
          variant="ghost"
        >
          {t("refresh")}
        </Button>
      </div>
      {pendingId === null ? null : (
        <Alert>
          <AlertDescription className="flex flex-col gap-3">
            <span>{t("confirm", { budget })}</span>
            <span className="flex flex-wrap gap-3">
              <Button
                className="h-9 px-4"
                disabled={busy}
                onClick={() => {
                  void onDecide(true);
                }}
              >
                {t("approve")}
              </Button>
              <Button
                className="h-9 px-4"
                disabled={busy}
                onClick={() => {
                  void onDecide(false);
                }}
                variant="outline"
              >
                {t("notNow")}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}
      <CampaignRules campaignId={campaign.id} />
      {notice === null ? null : (
        <output className="text-muted-foreground text-sm">{notice}</output>
      )}
      {missing === undefined ? null : (
        <ConnectState
          provider={missing.provider}
          reconnect={missing.reconnect}
        />
      )}
      {failure === null || missing !== undefined ? null : (
        <p className="text-destructive text-sm" role="alert">
          {t("failed", { reason: failure.message })}
        </p>
      )}
    </div>
  );
};
