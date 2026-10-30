"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { Progress } from "@wovain/ui/components/progress";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useHere } from "@/components/app/connect-state";
import { StateIcon } from "@/components/store/store-setup";
import type {
  MetaSetup as Setup,
  MetaSetupStep as Step,
} from "@/lib/flow-client";
import { connectUrl } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// Polled while a step is open, so a card added or a Page linked in Meta
// ticks off here by itself; coming back to the tab refetches at once.
const POLL_MS = 10_000;

const MetaLink = ({
  children,
  href,
  primary,
}: {
  children: React.ReactNode;
  href: string;
  primary: boolean;
}) => (
  <a
    className={cn(
      buttonVariants({ size: "sm", variant: primary ? "default" : "outline" }),
      "gap-1.5"
    )}
    href={href}
    rel="noopener noreferrer"
    target="_blank"
  >
    {children}
    <ExternalLink aria-hidden="true" className="size-3.5" />
  </a>
);

const StepAction = ({ step }: { step: Step }) => {
  const t = useTranslations("Store.metaSetup");
  const here = useHere();
  if (step.state === "done") {
    return null;
  }
  if (step.how === "reconnect") {
    return (
      <a
        className={buttonVariants({ size: "sm" })}
        href={connectUrl("meta", here)}
      >
        {t("reconnect")}
      </a>
    );
  }
  if (step.href === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MetaLink href={step.href} primary={step.state === "todo"}>
        {t(`${step.id}.action`)}
      </MetaLink>
      {step.altHref === null ? null : (
        <MetaLink href={step.altHref} primary={false}>
          {t(`${step.id}.altAction`)}
        </MetaLink>
      )}
    </div>
  );
};

/** Connect, reconnect or disconnect the one Meta grant. */
const MetaConnection = ({ setup }: { setup: Setup }) => {
  const t = useTranslations("Store.metaSetup");
  const here = useHere();
  const queryClient = useQueryClient();
  const disconnect = useMutation(
    orpc.connections.disconnect.mutationOptions({
      onSuccess: async () => {
        toast.success(t("disconnected"));
        await queryClient.invalidateQueries();
      },
    })
  );
  if (!setup.connected || setup.needsReconnect) {
    return (
      <a
        className={buttonVariants({ size: "sm" })}
        href={connectUrl("meta", here)}
      >
        {setup.needsReconnect ? t("reconnect") : t("connect")}
      </a>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        className={buttonVariants({ size: "sm", variant: "ghost" })}
        href={connectUrl("meta", here)}
      >
        {t("reconnect")}
      </a>
      <Button
        disabled={disconnect.isPending}
        onClick={() => disconnect.mutate({ provider: "meta" })}
        size="sm"
        variant="outline"
      >
        {t("disconnect")}
      </Button>
    </div>
  );
};

/**
 * Meta setup: the ad account, its payment method, its Page, Instagram and
 * the safety rules, each a card with plain steps and a button that opens
 * the exact Meta screen in a new tab. The cards tick off by polling.
 */
export const MetaSetup = () => {
  const t = useTranslations("Store.metaSetup");
  const query = useQuery({
    ...orpc.store.metaSetup.queryOptions(),
    refetchInterval: (current) =>
      current.state.data?.steps.some(
        (step) => step.required && step.state !== "done"
      ) === true
        ? POLL_MS
        : false,
    refetchOnWindowFocus: true,
  });
  if (query.isPending) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
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
  return (
    <section
      aria-labelledby="meta-setup"
      className="border-border bg-card rounded-xl border"
      id="meta-setup-cards"
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="font-display text-lg font-semibold tracking-[-0.015em]"
            id="meta-setup"
          >
            {done === required.length ? t("titleReady") : t("title")}
          </h2>
          <MetaConnection setup={setup} />
        </div>
        {setup.connected && !setup.needsReconnect ? (
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
        ) : (
          <p className="text-muted-foreground text-sm">
            {setup.needsReconnect ? t("expired") : t("notConnected")}
          </p>
        )}
      </div>
      {setup.connected && !setup.needsReconnect ? (
        <ol className="divide-border border-border divide-y border-t">
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
                  <p className="text-muted-foreground text-sm">
                    {t(`${step.id}.${step.state}`)}
                  </p>
                </div>
              </div>
              <div className="ps-8 sm:ps-0">
                <StepAction step={step} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
};
