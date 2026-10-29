"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { useFormatter, useTranslations } from "next-intl";

import type { Tone } from "@/components/store/store-shared";
import { StatusDot, useRequest } from "@/components/store/store-shared";
import type { StoreApproval } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const QUEUE_LIMIT = 30;

const TONES: Record<StoreApproval["status"], Tone> = {
  approved: "success",
  denied: "danger",
  done: "success",
  executing: "warning",
  expired: "muted",
  failed: "danger",
  pending: "warning",
  rejected: "muted",
  reverted: "muted",
};

/** The store's pending approvals, for the summary and the tab's count. */
export const usePendingStoreApprovals = () =>
  useQuery(
    orpc.approvals.list.queryOptions({
      input: { domain: "store", limit: QUEUE_LIMIT, statuses: ["pending"] },
    })
  );

const ApprovalRow = ({ approval }: { approval: StoreApproval }) => {
  const t = useTranslations("Store.queue");
  const format = useFormatter();
  const request = useRequest();
  const decide = useMutation(orpc.approvals.decide.mutationOptions(request));
  const pending = approval.status === "pending";
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{approval.title}</p>
        {approval.costPreview ? (
          <p className="figures text-sm">{approval.costPreview.label}</p>
        ) : null}
        {approval.error ? (
          <p className="text-destructive text-sm">{approval.error}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          <StatusDot tone={TONES[approval.status]}>
            {t(`status.${approval.status}`)}
          </StatusDot>
          {" · "}
          {format.relativeTime(new Date(approval.createdAt))}
        </p>
      </div>
      {pending ? (
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({ approvalId: approval.id, approve: false })
            }
            size="sm"
            variant="outline"
          >
            {t("reject")}
          </Button>
          <Button
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({ approvalId: approval.id, approve: true })
            }
            size="sm"
          >
            {t("approve")}
          </Button>
        </div>
      ) : null}
    </li>
  );
};

/** Queued store actions, newest first: what waits for you, then history. */
export const StoreApprovals = () => {
  const t = useTranslations("Store.queue");
  const query = useQuery(
    orpc.approvals.list.queryOptions({
      input: { domain: "store", limit: QUEUE_LIMIT },
    })
  );
  const waiting = query.data?.filter((each) => each.status === "pending");
  const settled = query.data?.filter((each) => each.status !== "pending");
  return (
    <section aria-labelledby="store-queue" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold" id="store-queue">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("lead")}</p>
      </div>
      {query.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {query.isError ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}
      {waiting?.length === 0 ? (
        <p className="border-input text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          {t("empty")}
        </p>
      ) : null}
      {waiting !== undefined && waiting.length > 0 ? (
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {waiting.map((approval) => (
            <ApprovalRow approval={approval} key={approval.id} />
          ))}
        </ul>
      ) : null}
      {settled !== undefined && settled.length > 0 ? (
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
            {t("history", { count: settled.length })}
          </summary>
          <ul className="border-border bg-card divide-border mt-3 divide-y rounded-xl border">
            {settled.map((approval) => (
              <ApprovalRow approval={approval} key={approval.id} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
};
