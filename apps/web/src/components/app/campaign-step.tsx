"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wovain/ui/components/alert-dialog";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import { cn } from "@wovain/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { ReactNode } from "react";
import { useState } from "react";

import { CampaignAudience } from "@/components/app/campaign-audience";
import { CampaignControls } from "@/components/app/campaign-controls";
import { CampaignRules } from "@/components/app/campaign-rules";
import { CampaignCompetition } from "@/components/app/competition-panel";
import { ConnectState } from "@/components/app/connect-state";
import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import { BudgetField, useMoney } from "@/components/app/wizard-steps";
import { Link } from "@/i18n/navigation";
import type { Campaign, Product } from "@/lib/flow-client";
import { missingConnection } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const CENTS = 100;
const CREATIVE_SIZE = 320;
// Only a staged campaign that can't spend yet is launched.
const STARTABLE = new Set<Campaign["status"]>(["draft", "paused"]);

/** The copy variants of one campaign, as the ads read on Meta. */
const AdVariants = ({ campaign }: { campaign: Campaign }) => (
  <ul className="grid gap-3 md:grid-cols-3">
    {campaign.copy.map((variant) => (
      <li className="flex" key={variant.headline}>
        <Card className="w-full" size="sm">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              {variant.angle}
            </Badge>
            <CardTitle className="mt-1 font-medium">
              {variant.headline}
            </CardTitle>
            <CardDescription>{variant.message}</CardDescription>
          </CardHeader>
        </Card>
      </li>
    ))}
  </ul>
);

const Part = ({ children, title }: { children: ReactNode; title: string }) => (
  <section className="flex flex-col gap-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

/** Whether Meta is connected: undefined while the connections load. */
const useMetaReady = () => {
  const connections = useQuery(orpc.connections.list.queryOptions());
  if (connections.data === undefined) {
    return;
  }
  const meta = connections.data.find((one) => one.provider === "meta");
  return meta !== undefined && !meta.needsReconnect;
};

/**
 * The campaign step: the ad creatives, the copy, Qloo's audience, the
 * budget and the spend rules, then one "Launch campaign". Launching stages
 * the paused campaign on Meta (writing the copy) if it isn't yet, then the
 * confirm is the merchant's approval to spend: the campaign is asked to go
 * live and approved in one go. Without live media buying it stays paused
 * for Ads Manager, as before. Without Meta, the step shows the creatives
 * and how to connect it.
 */
export const CampaignStep = ({
  budget,
  budgetInvalid,
  busyLabel,
  campaigns,
  onBack,
  onBudget,
  onLaunched,
  onStage,
  products,
  titles,
}: {
  budget: string;
  budgetInvalid: boolean;
  busyLabel?: string | undefined;
  campaigns: Campaign[];
  onBack: () => void;
  onBudget: (value: string) => void;
  // Done: `live` says whether the campaign was asked to spend.
  onLaunched: (live: boolean) => void;
  onStage: (then: () => void) => void;
  products: Product[];
  titles: Record<string, string>;
}) => {
  const t = useTranslations("Wizard.campaign");
  const media = useTranslations("Wizard.done.media");
  const money = useMoney();
  const metaReady = useMetaReady();
  const liveBuying = useQuery(orpc.campaigns.liveBuying.queryOptions());
  const activate = useMutation(orpc.campaigns.activate.mutationOptions());
  const decide = useMutation(orpc.approvals.decide.mutationOptions());
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string>();

  const live = liveBuying.data?.available === true;
  const staged = campaigns.filter((one) => STARTABLE.has(one.status));
  const launching = activate.isPending || decide.isPending;
  const dailyCents =
    campaigns.length > 0
      ? campaigns.reduce((sum, one) => sum + one.dailyBudgetCents, 0)
      : Math.round(Number(budget) * CENTS);
  // The images, then the video ad clips fal made for each product.
  const creatives = products.flatMap((product) => {
    const title = titles[product.designId] ?? "";
    return [
      ...product.mockups.map((url) => ({ title, url, video: false })),
      ...(product.videos ?? []).map(({ url }) => ({ title, url, video: true })),
    ];
  });

  const afterStaged = () => (live ? setConfirming(true) : onLaunched(false));
  const onLaunch = () => {
    setNotice(undefined);
    if (campaigns.length === 0) {
      onStage(afterStaged);
      return;
    }
    afterStaged();
  };

  // The confirm is the approval: each staged campaign is asked to go live
  // and approved in the merchant's name; the approval queue still checks
  // their caps (approvals.decide, flow/media).
  const onConfirm = async () => {
    for (const one of staged) {
      // One at a time: each approval counts against the same caps.
      // oxlint-disable-next-line no-await-in-loop
      const approval = await activate.mutateAsync({
        campaignId: one.id,
        requestId: crypto.randomUUID(),
      });
      if (approval.status === "denied") {
        setConfirming(false);
        setNotice(media("overCap"));
        return;
      }
      if (approval.status === "pending") {
        // oxlint-disable-next-line no-await-in-loop
        await decide.mutateAsync({ approvalId: approval.id, approve: true });
      }
    }
    setConfirming(false);
    onLaunched(true);
  };

  const failure = activate.error ?? decide.error;
  const missing = missingConnection(failure);

  return (
    <div className="flex flex-col gap-8">
      <StepHeader lead={t("lead")} title={t("title")} />

      <Part title={t("creatives")}>
        {creatives.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noCreatives")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {creatives.map((creative) => (
              <li
                className="bg-muted aspect-square overflow-hidden rounded-xl"
                key={creative.url}
              >
                {creative.video ? (
                  <video
                    aria-label={t("videoAlt", { title: creative.title })}
                    autoPlay
                    className="size-full object-contain"
                    controls
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    src={creative.url}
                  />
                ) : (
                  <Image
                    alt={t("creativeAlt", { title: creative.title })}
                    className="size-full object-contain"
                    height={CREATIVE_SIZE}
                    src={creative.url}
                    unoptimized
                    width={CREATIVE_SIZE}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Part>

      <Part title={t("copy")}>
        {campaigns.length === 0 ? (
          <p className="text-muted-foreground max-w-[65ch] text-sm">
            {t("copyPending")}
          </p>
        ) : (
          campaigns.map((one) => <AdVariants campaign={one} key={one.id} />)
        )}
      </Part>

      <CampaignAudience title={t("audience")} />

      {metaReady === false ? (
        <ConnectState
          body={t("connectBody")}
          provider="meta"
          title={t("connectTitle")}
        >
          <Link
            className={cn(buttonVariants({ variant: "outline" }), "h-9 px-4")}
            href="/dashboard/store#setup"
          >
            {t("storeSetup")}
          </Link>
        </ConnectState>
      ) : (
        <>
          <Part title={t("budget")}>
            {campaigns.length === 0 ? (
              <BudgetField
                budget={budget}
                invalid={budgetInvalid}
                onBudget={onBudget}
              />
            ) : (
              <p className="figures text-sm">
                {t("budgetSet", { budget: money(dailyCents / CENTS) })}
              </p>
            )}
          </Part>
          <Part title={t("rules")}>
            {campaigns.length === 0 ? (
              <p className="text-muted-foreground max-w-[65ch] text-sm">
                {t("rulesPending")}
              </p>
            ) : (
              campaigns.map((one) => (
                <CampaignRules campaignId={one.id} key={one.id} />
              ))
            )}
          </Part>
        </>
      )}

      {notice === undefined ? null : (
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
          {media("failed", { reason: failure.message })}
        </p>
      )}

      <StepActions busyLabel={busyLabel} onBack={onBack}>
        <NextButton
          disabled={
            Boolean(busyLabel) ||
            launching ||
            metaReady !== true ||
            (campaigns.length === 0 && budgetInvalid)
          }
          onClick={onLaunch}
        >
          {t("submit")}
        </NextButton>
      </StepActions>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !launching) {
            setConfirming(false);
          }
        }}
        open={confirming}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.body", { budget: money(dailyCents / CENTS) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={launching}>
              {t("confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={launching}
              onClick={() => {
                void onConfirm();
              }}
            >
              {t("confirm.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const adsManagerUrl = (campaign: Campaign) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${campaign.adAccountId}&selected_campaign_ids=${campaign.metaCampaignId}`;

export const DoneStep = ({
  campaigns,
  onRestart,
}: {
  campaigns: Campaign[];
  onRestart: () => void;
}) => {
  const t = useTranslations("Wizard.done");
  const money = useMoney();
  const [first] = campaigns;
  // Launched: asked to spend, past the paused staging.
  const launched = campaigns.some((one) => !STARTABLE.has(one.status));
  const lead = {
    budget: money((first?.dailyBudgetCents ?? 0) / CENTS),
    count: campaigns.length,
  };
  return (
    <div className="flex flex-col items-start gap-6">
      <StepHeader
        lead={launched ? t("launchedLead", lead) : t("lead", lead)}
        title={launched ? t("launchedTitle") : t("title")}
      />
      {campaigns.map((campaign) => (
        <section
          aria-label={t("variants")}
          className="flex w-full flex-col gap-3"
          key={campaign.id}
        >
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("variants")}
          </h3>
          <AdVariants campaign={campaign} />
          <a
            className={cn(buttonVariants(), "h-9 w-fit px-4")}
            href={adsManagerUrl(campaign)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("open")}
            <ExternalLink aria-hidden="true" data-icon="inline-end" />
          </a>
          <CampaignCompetition campaign={campaign} />
          <CampaignControls campaign={campaign} />
        </section>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button className="h-9 px-4" onClick={onRestart} variant="outline">
          {t("another")}
        </Button>
        <Link
          className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-4")}
          href="/dashboard/drops"
        >
          {t("history")}
        </Link>
      </div>
    </div>
  );
};
