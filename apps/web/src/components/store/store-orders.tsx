"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wovain/ui/components/dialog";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { Tone } from "@/components/store/store-shared";
import {
  AdminLink,
  ConfirmApproval,
  StatusDot,
  useMoney,
  useRefresh,
} from "@/components/store/store-shared";
import type { StoreApproval, StoreOrder } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// Fourthwall pages orders 10 at a time.
const PAGE_SIZE = 10;

type Kind = "refund" | "cancel";

const ORDER_TONE = {
  ABANDONED: "muted",
  CANCELLED: "danger",
  COMPLETED: "success",
  CONFIRMED: "warning",
  DELIVERED: "success",
  FAILED: "danger",
  IN_PRODUCTION: "warning",
  OPEN: "warning",
  PARTIALLY_DELIVERED: "success",
  PARTIALLY_IN_PRODUCTION: "warning",
  PARTIALLY_SHIPPED: "success",
  SHIPPED: "success",
} as const satisfies Record<string, Tone>;
type OrderStatus = keyof typeof ORDER_TONE;

const isOrderStatus = (status: string): status is OrderStatus =>
  Object.hasOwn(ORDER_TONE, status);

const remainingOf = (order: StoreOrder) =>
  (order.totalCents ?? 0) - (order.refundedCents ?? 0);

/** Reason, then Fourthwall's cost preview, then confirm (R4). */
const OrderDialog = ({
  order,
  kind,
  onClose,
}: {
  order: StoreOrder | undefined;
  kind: Kind;
  onClose: () => void;
}) => {
  const t = useTranslations("Store.orders");
  const money = useMoney();
  const refresh = useRefresh();
  const [queued, setQueued] = useState<StoreApproval | undefined>();
  const settle = async (approval: StoreApproval) => {
    await refresh();
    if (approval.status === "pending") {
      setQueued(approval);
    } else {
      onClose();
    }
  };
  const options = {
    onError: (error: Error) => toast.error(error.message),
    onSuccess: settle,
  };
  const refund = useMutation(orpc.store.refund.mutationOptions(options));
  const cancel = useMutation(orpc.store.cancel.mutationOptions(options));
  const close = () => {
    setQueued(undefined);
    onClose();
  };
  const busy = refund.isPending || cancel.isPending;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={order !== undefined}
    >
      <DialogContent>
        {order === undefined ? null : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t(kind === "refund" ? "refundTitle" : "cancelTitle", {
                  id: order.friendlyId,
                })}
              </DialogTitle>
              <DialogDescription>
                {kind === "refund"
                  ? t("refundBody", {
                      amount: money.cents(
                        remainingOf(order),
                        order.currency ?? "USD"
                      ),
                    })
                  : t("cancelBody")}
              </DialogDescription>
            </DialogHeader>
            {queued === undefined ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const reason = String(
                    new FormData(event.currentTarget).get("reason")
                  );
                  const base = {
                    friendlyId: order.friendlyId,
                    orderId: order.id,
                    reason,
                  };
                  if (kind === "refund") {
                    refund.mutate({
                      ...base,
                      amountCents: remainingOf(order),
                      // The order's own currency; the server checks it is
                      // one Fourthwall refunds in.
                      currency: order.currency as "USD",
                    });
                  } else {
                    cancel.mutate(base);
                  }
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="order-reason">{t("reason")}</Label>
                  <Input
                    id="order-reason"
                    maxLength={500}
                    minLength={3}
                    name="reason"
                    required
                  />
                </div>
                <DialogFooter>
                  <Button onClick={close} type="button" variant="outline">
                    {t("back")}
                  </Button>
                  <Button disabled={busy} type="submit">
                    {busy
                      ? t("previewing")
                      : t(
                          kind === "refund" ? "previewRefund" : "previewCancel"
                        )}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <ConfirmApproval
                approval={queued}
                confirmLabel={t(
                  kind === "refund" ? "confirmRefund" : "confirmCancel"
                )}
                onDone={close}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const StoreOrders = () => {
  const t = useTranslations("Store.orders");
  const format = useFormatter();
  const money = useMoney();
  const [page, setPage] = useState(0);
  const [acting, setActing] = useState<
    { kind: Kind; order: StoreOrder } | undefined
  >();
  const query = useQuery({
    ...orpc.store.orders.queryOptions({ input: { page } }),
    placeholderData: keepPreviousData,
  });
  const orders = query.data ?? [];
  return (
    <section aria-labelledby="store-orders" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold" id="store-orders">
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("lead")}</p>
        </div>
        <AdminLink page="orders">{t("inFourthwall")}</AdminLink>
      </div>
      {query.isPending ? <Skeleton className="h-40 w-full rounded-xl" /> : null}
      {query.isError ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}
      {query.isSuccess && orders.length === 0 && page === 0 ? (
        <p className="border-input text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          {t("empty")}
        </p>
      ) : null}
      {orders.length > 0 ? (
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {orders.map((order) => {
            const remaining = remainingOf(order);
            return (
              <li
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6"
                key={order.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
                    <span className="figures">{order.friendlyId}</span>
                    {order.createdAt ? (
                      <span className="text-muted-foreground text-xs font-normal">
                        {format.dateTime(new Date(order.createdAt), {
                          dateStyle: "medium",
                        })}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {order.items
                      .map((item) => `${item.quantity} × ${item.name}`)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {isOrderStatus(order.status) ? (
                    <StatusDot tone={ORDER_TONE[order.status]}>
                      {t(`status.${order.status}`)}
                    </StatusDot>
                  ) : (
                    <StatusDot tone="muted">{order.status}</StatusDot>
                  )}
                  <span className="figures w-20 text-end">
                    {money.cents(order.totalCents, order.currency ?? "USD")}
                  </span>
                </div>
                <div className="flex gap-2">
                  {remaining > 0 && order.currency ? (
                    <Button
                      onClick={() => setActing({ kind: "refund", order })}
                      size="sm"
                      variant="outline"
                    >
                      {t("refund")}
                    </Button>
                  ) : null}
                  {order.status === "CANCELLED" ? null : (
                    <Button
                      onClick={() => setActing({ kind: "cancel", order })}
                      size="sm"
                      variant="ghost"
                    >
                      {t("cancel")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {page > 0 || orders.length === PAGE_SIZE ? (
        <nav
          aria-label={t("pages")}
          className="flex items-center justify-end gap-2"
        >
          <Button
            disabled={page === 0 || query.isFetching}
            onClick={() => setPage((current) => current - 1)}
            size="sm"
            variant="outline"
          >
            {t("newer")}
          </Button>
          <Button
            disabled={orders.length < PAGE_SIZE || query.isFetching}
            onClick={() => setPage((current) => current + 1)}
            size="sm"
            variant="outline"
          >
            {t("older")}
          </Button>
        </nav>
      ) : null}
      <OrderDialog
        kind={acting?.kind ?? "refund"}
        onClose={() => setActing(undefined)}
        order={acting?.order}
      />
    </section>
  );
};
