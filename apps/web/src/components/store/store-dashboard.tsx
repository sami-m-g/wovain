"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wovain/ui/components/alert";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { ConnectState } from "@/components/app/connect-state";
import type {
  StoreApproval,
  StoreDrop,
  StoreOrder,
  StoreProduct,
} from "@/lib/flow-client";
import { missingConnection } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const THUMB = 56;
const CENTS = 100;

/** Refreshes every store query and the approval list after a request. */
const useRefresh = () => {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.store.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.approvals.key() }),
    ]);
  };
};

/** A request's outcome as a toast: queued, done at once, or refused. */
const useRequest = () => {
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
      await refresh();
    },
  };
};

/** No shop to read until Fourthwall is connected: the way to connect it. */
const ShopConnect = ({ reconnect }: { reconnect: boolean }) => {
  const t = useTranslations("Store.readiness");
  return (
    <section aria-labelledby="store-connect">
      <ConnectState
        body={t("connectBody")}
        headingId="store-connect"
        provider="fourthwall"
        reconnect={reconnect}
        title={reconnect ? undefined : t("connectTitle")}
      />
    </section>
  );
};

const Readiness = () => {
  const t = useTranslations("Store.readiness");
  const query = useQuery(orpc.store.readiness.queryOptions());
  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  const missing = missingConnection(query.error);
  if (missing !== undefined) {
    return <ShopConnect reconnect={missing.reconnect} />;
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
      </Alert>
    );
  }
  const { checks, ready } = query.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-display text-lg font-semibold">{t("title")}</h2>
        </CardTitle>
        <CardDescription>{ready ? t("ready") : t("notReady")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {checks.map((check) => (
            <li className="flex items-start gap-3" key={check.id}>
              {check.ok ? (
                <CircleCheck
                  aria-hidden="true"
                  className="text-success mt-0.5 size-4 shrink-0"
                />
              ) : (
                <CircleDashed
                  aria-hidden="true"
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
              )}
              <div>
                <p className="text-sm font-medium">
                  {t(`${check.id}.label`)}
                  <span className="sr-only">
                    {check.ok ? t("passed") : t("failed")}
                  </span>
                </p>
                {check.ok ? null : (
                  <p className="text-muted-foreground text-sm">
                    {t(`${check.id}.fix`)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

const ApprovalItem = ({ approval }: { approval: StoreApproval }) => {
  const t = useTranslations("Store.queue");
  const request = useRequest();
  const decide = useMutation(orpc.approvals.decide.mutationOptions(request));
  const pending = approval.status === "pending";
  return (
    <li className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{approval.title}</p>
        <Badge variant={pending ? "default" : "outline"}>
          {t(`status.${approval.status}`)}
        </Badge>
      </div>
      {approval.costPreview ? (
        <p className="text-sm">{approval.costPreview.label}</p>
      ) : null}
      {approval.error ? (
        <p className="text-destructive text-sm">{approval.error}</p>
      ) : null}
      {pending ? (
        <div className="flex gap-2">
          <Button
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({ approvalId: approval.id, approve: true })
            }
            size="sm"
          >
            {t("approve")}
          </Button>
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
        </div>
      ) : null}
    </li>
  );
};

const Queue = () => {
  const t = useTranslations("Store.queue");
  const query = useQuery(
    orpc.approvals.list.queryOptions({
      input: { domain: "store", limit: 20 },
    })
  );
  return (
    <section aria-labelledby="store-queue" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold" id="store-queue">
        {t("title")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("lead")}</p>
      {query.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {query.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {query.data?.map((approval) => (
          <ApprovalItem approval={approval} key={approval.id} />
        ))}
      </ul>
    </section>
  );
};

const PromotionForm = ({ drop }: { drop: StoreDrop }) => {
  const t = useTranslations("Store.drops");
  const request = useRequest();
  const plan = useMutation(orpc.store.launchPromotion.mutationOptions(request));
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const maxUses = Number(form.get("maxUses"));
    plan.mutate({
      code: String(form.get("code")),
      dropId: drop.id,
      endsAt: new Date(String(form.get("endsAt"))),
      maxUses: maxUses > 0 ? maxUses : undefined,
      percentage: Number(form.get("percentage")),
      startsAt: new Date(String(form.get("startsAt"))),
    });
  };
  const field = (name: string) => `promo-${drop.id}-${name}`;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field("code")}>{t("code")}</Label>
        <Input
          id={field("code")}
          name="code"
          pattern="[A-Za-z0-9]{3,24}"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field("percentage")}>{t("percentage")}</Label>
        <Input
          defaultValue={10}
          id={field("percentage")}
          max={90}
          min={1}
          name="percentage"
          required
          type="number"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field("maxUses")}>{t("maxUses")}</Label>
        <Input
          id={field("maxUses")}
          max={1000}
          min={1}
          name="maxUses"
          type="number"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field("startsAt")}>{t("startsAt")}</Label>
        <Input
          id={field("startsAt")}
          name="startsAt"
          required
          type="datetime-local"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={field("endsAt")}>{t("endsAt")}</Label>
        <Input
          id={field("endsAt")}
          name="endsAt"
          required
          type="datetime-local"
        />
      </div>
      <Button
        className="sm:col-span-2 lg:col-span-5 lg:justify-self-start"
        disabled={plan.isPending}
        type="submit"
        variant="outline"
      >
        {t("planPromotion")}
      </Button>
    </form>
  );
};

const Drops = () => {
  const t = useTranslations("Store.drops");
  const status = useTranslations("Store.dropStatus");
  const request = useRequest();
  const query = useQuery(orpc.store.drops.queryOptions());
  const publish = useMutation(orpc.store.publishDrop.mutationOptions(request));
  return (
    <section aria-labelledby="store-drops" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold" id="store-drops">
        {t("title")}
      </h2>
      {query.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {query.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {query.data?.map((drop) => (
          <li
            className="border-border flex flex-col gap-4 rounded-lg border p-4"
            key={drop.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{drop.name}</p>
                <p className="text-muted-foreground text-sm">
                  {t("products", { count: drop.productIds.length })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{status(drop.status)}</Badge>
                {drop.status === "live" || drop.status === "retired" ? null : (
                  <Button
                    disabled={publish.isPending}
                    onClick={() => publish.mutate({ dropId: drop.id })}
                    size="sm"
                  >
                    {t("publish")}
                  </Button>
                )}
              </div>
            </div>
            <PromotionForm drop={drop} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const Sample = ({ product }: { product: StoreProduct }) => {
  const t = useTranslations("Store.products");
  const [open, setOpen] = useState(false);
  const variants = useQuery({
    ...orpc.store.variants.queryOptions({ input: { productId: product.id } }),
    enabled: open,
  });
  const sample = useMutation(
    orpc.store.sample.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: ({ url }) => {
        window.open(url, "_blank", "noopener");
      },
    })
  );
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="ghost">
        {t("sample")}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">{t("sampleLead")}</span>
      {variants.isPending ? <Skeleton className="h-8 w-32" /> : null}
      {variants.data?.map((variant) => (
        <Button
          disabled={sample.isPending}
          key={variant.id}
          onClick={() =>
            sample.mutate({ productId: product.id, variantId: variant.id })
          }
          size="sm"
          variant="outline"
        >
          {variant.name}
        </Button>
      ))}
    </div>
  );
};

const Reprice = ({ product }: { product: StoreProduct }) => {
  const t = useTranslations("Store.products");
  const request = useRequest();
  const reprice = useMutation(orpc.store.reprice.mutationOptions(request));
  const id = `price-${product.id}`;
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const price = Number(new FormData(event.currentTarget).get("price"));
        reprice.mutate({ price, productId: product.id });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t("price")}</Label>
        <Input
          className="w-24"
          defaultValue={product.price}
          id={id}
          min={1}
          name="price"
          step="0.01"
          type="number"
        />
      </div>
      <Button
        disabled={reprice.isPending}
        size="sm"
        type="submit"
        variant="outline"
      >
        {t("reprice")}
      </Button>
    </form>
  );
};

type Move = "publish" | "unpublish" | "retire";

const MOVES: Record<StoreProduct["status"], Move[]> = {
  hidden: ["publish", "retire"],
  in_review: ["publish", "retire"],
  paused: ["publish", "retire"],
  public: ["unpublish", "retire"],
  retired: [],
};

const ProductRow = ({ product }: { product: StoreProduct }) => {
  const t = useTranslations("Store.products");
  const status = useTranslations("Store.productStatus");
  const format = useFormatter();
  const request = useRequest();
  const move = useMutation(orpc.store.moveProduct.mutationOptions(request));
  const [mockup] = product.mockups;
  return (
    <li className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-4">
        {mockup ? (
          <Image
            alt={t("mockupAlt", { title: product.title })}
            className="bg-muted rounded-md object-contain"
            height={THUMB}
            src={mockup}
            unoptimized
            width={THUMB}
          />
        ) : null}
        <div className="min-w-40 flex-1">
          <p className="font-medium">{product.title}</p>
          <p className="text-muted-foreground figures text-sm">
            {format.number(product.price, {
              currency: "USD",
              style: "currency",
            })}
          </p>
        </div>
        <Badge variant={product.status === "public" ? "default" : "outline"}>
          {status(product.status)}
        </Badge>
        {product.productUrl && product.status === "public" ? (
          <a
            className="text-sm underline underline-offset-4"
            href={product.productUrl}
            rel="noopener"
            target="_blank"
          >
            {t("view")}
          </a>
        ) : null}
      </div>
      {product.status === "retired" ? null : (
        <div className="flex flex-wrap items-end gap-2">
          {MOVES[product.status].map((next) => (
            <Button
              disabled={move.isPending}
              key={next}
              onClick={() => move.mutate({ move: next, productId: product.id })}
              size="sm"
              variant={next === "retire" ? "destructive" : "default"}
            >
              {t(`move.${next}`)}
            </Button>
          ))}
          <Reprice product={product} />
          <Sample product={product} />
        </div>
      )}
    </li>
  );
};

const Products = () => {
  const t = useTranslations("Store.products");
  const query = useQuery(orpc.store.products.queryOptions());
  return (
    <section aria-labelledby="store-products" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold" id="store-products">
        {t("title")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("lead")}</p>
      {query.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {query.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {query.data?.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </ul>
    </section>
  );
};

const OrderActions = ({ order }: { order: StoreOrder }) => {
  const t = useTranslations("Store.orders");
  const request = useRequest();
  const [kind, setKind] = useState<"refund" | "cancel" | undefined>();
  const refund = useMutation(orpc.store.refund.mutationOptions(request));
  const cancel = useMutation(orpc.store.cancel.mutationOptions(request));
  const remaining = (order.totalCents ?? 0) - (order.refundedCents ?? 0);
  if (kind === undefined) {
    return (
      <div className="flex gap-2">
        {remaining > 0 && order.currency ? (
          <Button onClick={() => setKind("refund")} size="sm" variant="outline">
            {t("refund")}
          </Button>
        ) : null}
        <Button onClick={() => setKind("cancel")} size="sm" variant="outline">
          {t("cancel")}
        </Button>
      </div>
    );
  }
  const id = `reason-${order.id}`;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason"));
        const base = {
          friendlyId: order.friendlyId,
          orderId: order.id,
          reason,
        };
        if (kind === "refund") {
          refund.mutate({
            ...base,
            amountCents: remaining,
            // The order's own currency; the server checks it is one
            // Fourthwall refunds in.
            currency: order.currency as "USD",
          });
        } else {
          cancel.mutate(base);
        }
        setKind(undefined);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t("reason")}</Label>
        <Input className="w-56" id={id} minLength={3} name="reason" required />
      </div>
      <Button size="sm" type="submit">
        {kind === "refund" ? t("previewRefund") : t("previewCancel")}
      </Button>
      <Button
        onClick={() => setKind(undefined)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("back")}
      </Button>
    </form>
  );
};

const Orders = () => {
  const t = useTranslations("Store.orders");
  const format = useFormatter();
  const query = useQuery(
    orpc.store.orders.queryOptions({ input: { page: 0 } })
  );
  return (
    <section aria-labelledby="store-orders" className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold" id="store-orders">
        {t("title")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("lead")}</p>
      {query.isPending ? <Skeleton className="h-20 w-full" /> : null}
      {query.isError ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}
      {query.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {query.data?.map((order) => (
          <li
            className="border-border flex flex-col gap-3 rounded-lg border p-4"
            key={order.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{order.friendlyId}</p>
                <p className="text-muted-foreground text-sm">
                  {order.items
                    .map((item) => `${item.quantity} × ${item.name}`)
                    .join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {order.totalCents !== null && order.currency ? (
                  <span className="figures text-sm">
                    {format.number(order.totalCents / CENTS, {
                      currency: order.currency,
                      style: "currency",
                    })}
                  </span>
                ) : null}
                <Badge variant="outline">{order.status}</Badge>
              </div>
            </div>
            <OrderActions order={order} />
          </li>
        ))}
      </ul>
    </section>
  );
};

/** The products page: readiness, the store's approval queue, drops, products and orders. */
export const StoreDashboard = () => {
  const t = useTranslations("Store");
  const connections = useQuery(orpc.connections.list.queryOptions());
  const fourthwall = connections.data?.find(
    (each) => each.provider === "fourthwall"
  );
  // Until Fourthwall is connected there is no shop to read: one connect
  // state stands in for readiness, drops, products and orders.
  const shopless =
    connections.isSuccess &&
    (fourthwall === undefined || fourthwall.needsReconnect);
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </header>
      {shopless ? (
        <>
          <ShopConnect reconnect={fourthwall?.needsReconnect === true} />
          <Queue />
        </>
      ) : (
        <>
          <Readiness />
          <Queue />
          <Drops />
          <Products />
          <Orders />
        </>
      )}
    </div>
  );
};
