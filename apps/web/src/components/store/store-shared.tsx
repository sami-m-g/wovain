"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";

import type { StoreApproval } from "@/lib/flow-client";
import type { FourthwallAdminPage } from "@/lib/fourthwall-admin";
import { fourthwallAdminUrl } from "@/lib/fourthwall-admin";
import { orpc } from "@/utils/orpc";

const CENTS = 100;
export const DASH = "–";

/** Refreshes every store query and the approval list after a request. */
export const useRefresh = () => {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.store.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.approvals.key() }),
    ]);
  };
};

/**
 * A request's outcome: done at once (approved in the merchant's name) or
 * waiting in the approvals. Errors are the server's own message.
 */
export const useRequest = (then?: (approval: { status: string }) => void) => {
  const t = useTranslations("Store");
  const refresh = useRefresh();
  return {
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: async (approval: { status: string }) => {
      toast.success(
        approval.status === "pending" ? t("queued") : t("approved")
      );
      then?.(approval);
      await refresh();
    },
  };
};

/** Money in the merchant's locale. */
export const useMoney = () => {
  const format = useFormatter();
  return {
    cents: (cents: number | null | undefined, currency = "USD") =>
      cents === null || cents === undefined
        ? DASH
        : format.number(cents / CENTS, { currency, style: "currency" }),
    dollars: (value: number | null | undefined, currency = "USD") =>
      value === null || value === undefined
        ? DASH
        : format.number(value, { currency, style: "currency" }),
  };
};

/**
 * "Open in Fourthwall": a deep link into the Fourthwall admin for what
 * wovain doesn't cover. Opens in a new tab.
 */
export const AdminLink = ({
  page,
  children,
  className,
  variant = "link",
}: {
  page: FourthwallAdminPage;
  children?: ReactNode;
  className?: string;
  variant?: "link" | "outline" | "ghost";
}) => {
  const t = useTranslations("Store");
  return (
    <a
      className={cn(
        variant === "link"
          ? "text-foreground inline-flex items-center gap-1 text-sm underline underline-offset-4"
          : cn(buttonVariants({ size: "sm", variant }), "gap-1.5"),
        className
      )}
      href={fourthwallAdminUrl(page)}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children ?? t("openAdmin")}
      <ExternalLink aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{t("newTab")}</span>
    </a>
  );
};

export type Tone = "success" | "warning" | "danger" | "muted";

const TONE: Record<Tone, string> = {
  danger: "bg-destructive",
  muted: "bg-muted-foreground/50",
  success: "bg-success",
  warning: "bg-warning",
};

/** An 8px status dot plus its text: colour is never the only signal. */
export const StatusDot = ({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) => (
  <span className={cn("inline-flex items-center gap-1.5", className)}>
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", TONE[tone])}
    />
    {children}
  </span>
);

/**
 * The confirm step of an action that waits for the merchant (R3, R4): its
 * cost preview from Fourthwall, then confirm or leave it in the approvals.
 */
export const ConfirmApproval = ({
  approval,
  confirmLabel,
  onDone,
}: {
  approval: Pick<StoreApproval, "costPreview" | "id" | "status" | "title">;
  confirmLabel: string;
  onDone: () => void;
}) => {
  const t = useTranslations("Store.confirm");
  const request = useRequest(onDone);
  const decide = useMutation(orpc.approvals.decide.mutationOptions(request));
  if (approval.status !== "pending") {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted rounded-lg p-3">
        <p className="text-muted-foreground text-xs font-medium">
          {t("costTitle")}
        </p>
        <p className="figures mt-1 text-sm">
          {approval.costPreview?.label ?? approval.title}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone} size="sm" type="button" variant="outline">
          {t("later")}
        </Button>
        <Button
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate({ approvalId: approval.id, approve: true })
          }
          size="sm"
          type="button"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
};
