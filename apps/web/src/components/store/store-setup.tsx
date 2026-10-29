"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Progress } from "@wovain/ui/components/progress";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { CircleCheck, CircleDashed, Clock, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useHere } from "@/components/app/connect-state";
import { AdminLink, useRequest } from "@/components/store/store-shared";
import { GoLive } from "@/components/store/store-summary";
import { Link } from "@/i18n/navigation";
import type {
  StoreSetup as Setup,
  StoreSetupStep as Step,
} from "@/lib/flow-client";
import { connectUrl } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// Polled while a step is open, so a step finished in Fourthwall (payouts,
// shipping, the pixel) ticks off here by itself.
const POLL_MS = 10_000;

export const StateIcon = ({ state }: { state: Step["state"] }) => {
  if (state === "done") {
    return (
      <CircleCheck
        aria-hidden="true"
        className="text-success mt-0.5 size-5 shrink-0"
      />
    );
  }
  if (state === "waiting") {
    return (
      <Clock
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-5 shrink-0"
      />
    );
  }
  return (
    <CircleDashed
      aria-hidden="true"
      className={cn(
        "mt-0.5 size-5 shrink-0",
        state === "todo" ? "text-warning" : "text-muted-foreground"
      )}
    />
  );
};

const CopyId = ({ value }: { value: string }) => {
  const t = useTranslations("Store.setup");
  return (
    <span className="bg-muted inline-flex items-center gap-1 rounded-md py-0.5 ps-2 pe-0.5">
      <code className="font-mono text-xs">{value}</code>
      <Button
        aria-label={t("copy", { value })}
        className="size-7"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast.success(t("copied"));
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Copy aria-hidden="true" className="size-3.5" />
      </Button>
    </span>
  );
};

/**
 * Payouts: the exact Fourthwall page, and "Mark done" for payouts that
 * Fourthwall support set up by hand (PayPal, bill.com), which no API sees.
 */
const PayoutsAction = () => {
  const t = useTranslations("Store.setup.payouts");
  const request = useRequest();
  const confirm = useMutation(
    orpc.store.confirmSetupStep.mutationOptions(request)
  );
  return (
    <div className="flex flex-col items-start gap-2">
      <AdminLink page="billing" variant="outline">
        {t("action")}
      </AdminLink>
      <Button
        className="h-auto px-0 text-xs"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate({ step: "payouts" })}
        type="button"
        variant="link"
      >
        {t("markDone")}
      </Button>
    </div>
  );
};

/** The pixel's extra: Meta's Conversions API, which Fourthwall also runs. */
const PixelSteps = ({ datasetId }: { datasetId: string }) => {
  const t = useTranslations("Store.setup.pixel");
  return (
    <div className="text-muted-foreground flex flex-col gap-1.5 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        {t("paste")} <CopyId value={datasetId} />
      </p>
      <ol className="list-decimal ps-5">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <p>
        {t("capi")}{" "}
        <AdminLink page="metaCapi" variant="link">
          {t("capiAction")}
        </AdminLink>
      </p>
    </div>
  );
};

const PayoutSteps = ({
  status,
  confirmed,
}: {
  status: string | null;
  confirmed: boolean;
}) => {
  const t = useTranslations("Store.setup.payouts");
  if (confirmed) {
    return <p className="text-muted-foreground text-sm">{t("confirmed")}</p>;
  }
  return (
    <div className="text-muted-foreground flex flex-col gap-1.5 text-sm">
      <p>{status === "IN_PROGRESS" ? t("inProgress") : t("todo")}</p>
      <ol className="list-decimal ps-5">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <p>{t("noStripe")}</p>
    </div>
  );
};

/** What the merchant does for one step: an action here or a deep link. */
const StepAction = ({ setup, step }: { setup: Setup; step: Step }) => {
  const t = useTranslations("Store.setup");
  const here = useHere();
  if (step.state === "done") {
    return null;
  }
  switch (step.id) {
    case "connect": {
      return (
        <a
          className="text-sm underline underline-offset-4"
          href={connectUrl("fourthwall", here)}
        >
          {t("connect.action")}
        </a>
      );
    }
    case "site_live": {
      return step.state === "waiting" ? (
        <a
          className="text-sm underline underline-offset-4"
          href="https://help.fourthwall.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("site_live.support")}
        </a>
      ) : (
        <GoLive name={setup.shop.name} />
      );
    }
    case "pixel": {
      if (!setup.metaConnected) {
        return (
          <Link
            className="text-sm underline underline-offset-4"
            href="/dashboard/connections"
          >
            {t("pixel.connectMeta")}
          </Link>
        );
      }
      if (setup.pixel === null) {
        return null;
      }
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AdminLink page="trackingPixels" variant="outline">
            {t("pixel.action")}
          </AdminLink>
          {setup.shop.baseUrl ? (
            <a
              className="text-sm underline underline-offset-4"
              href={setup.shop.baseUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("pixel.test")}
            </a>
          ) : null}
        </div>
      );
    }
    case "payouts": {
      return <PayoutsAction />;
    }
    default: {
      return (
        <AdminLink page="settings" variant="outline">
          {t(`${step.id}.action`)}
        </AdminLink>
      );
    }
  }
};

const StepDetail = ({ setup, step }: { setup: Setup; step: Step }) => {
  const t = useTranslations("Store.setup");
  if (step.id === "pixel" && setup.pixel !== null && step.state !== "done") {
    return <PixelSteps datasetId={setup.pixel.datasetId} />;
  }
  if (
    step.id === "payouts" &&
    (step.state !== "done" || step.confirmedByMerchant)
  ) {
    return (
      <PayoutSteps
        confirmed={step.confirmedByMerchant === true}
        status={setup.shop.payoutStatus}
      />
    );
  }
  if (step.id === "pixel" && setup.metaConnected && setup.pixel === null) {
    return (
      <p className="text-muted-foreground text-sm">{t("pixel.noDataset")}</p>
    );
  }
  if (step.id === "domain" && setup.domain?.domain) {
    return (
      <p className="text-muted-foreground text-sm">
        {step.state === "done"
          ? t("domain.connected", { domain: setup.domain.domain })
          : t("domain.pending", {
              count: setup.domain.pendingRecords,
              domain: setup.domain.domain,
            })}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      {t(`${step.id}.${step.state}`)}
    </p>
  );
};

/**
 * Store setup: the tech checklist that takes the shop to sell-ready. Each
 * open step is "Do it for me" (through the approval queue) or a deep link
 * into Fourthwall that ticks off here once it's done.
 */
export const StoreSetup = () => {
  const t = useTranslations("Store.setup");
  const [open, setOpen] = useState<boolean | undefined>();
  const query = useQuery({
    ...orpc.store.setup.queryOptions(),
    refetchInterval: (current) =>
      current.state.data?.steps.some(
        (step) => step.required && step.state !== "done"
      ) === true
        ? POLL_MS
        : false,
  });
  if (query.isPending) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }
  if (query.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {query.error.message}
      </p>
    );
  }
  const setup = query.data;
  const required = setup.steps.filter((step) => step.required);
  const done = required.filter((step) => step.state === "done").length;
  const ready = done === required.length;
  const expanded = open ?? !ready;
  return (
    <section
      aria-labelledby="store-setup"
      className="border-border bg-card rounded-xl border"
      id="setup"
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="font-display text-lg font-semibold tracking-[-0.015em]"
            id="store-setup"
          >
            {ready ? t("titleReady") : t("title")}
          </h2>
          <button
            aria-controls="store-setup-steps"
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            onClick={() => setOpen(!expanded)}
            type="button"
          >
            {expanded ? t("hide") : t("show")}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Progress
            aria-label={t("progressLabel")}
            className="flex-1"
            value={(done / required.length) * 100}
          />
          <span className="figures text-muted-foreground shrink-0 text-sm">
            {t("progress", { done, total: required.length })}
          </span>
        </div>
      </div>
      {expanded ? (
        <ol
          className="divide-border border-border divide-y border-t"
          id="store-setup-steps"
        >
          {setup.steps.map((step) => (
            <li
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5"
              key={step.id}
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <StateIcon state={step.state} />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">
                    {t(`${step.id}.label`)}
                    {step.required ? null : (
                      <span className="text-muted-foreground ms-2 text-xs font-normal">
                        {t("optional")}
                      </span>
                    )}
                    <span className="sr-only"> {t(`state.${step.state}`)}</span>
                  </p>
                  <StepDetail setup={setup} step={step} />
                </div>
              </div>
              <div className="ps-8 sm:ps-0">
                <StepAction setup={setup} step={step} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
};
