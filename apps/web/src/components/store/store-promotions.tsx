"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Checkbox } from "@wovain/ui/components/checkbox";
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
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type { Tone } from "@/components/store/store-shared";
import {
  AdminLink,
  ConfirmApproval,
  StatusDot,
  useMoney,
  useRefresh,
  useRequest,
} from "@/components/store/store-shared";
import type { StoreApproval } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const PROMO_TONE: Record<string, Tone> = {
  ALL_USED: "muted",
  ARCHIVED: "muted",
  ENDED: "muted",
  LIVE: "success",
};

const GIFT_TONE: Record<string, Tone> = {
  ARCHIVED: "muted",
  DEACTIVATED: "muted",
  EXPIRED: "muted",
  FULLY_USED: "muted",
  PARTIALLY_USED: "warning",
  UNUSED: "success",
};

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const DEFAULT_PERCENT = 15;

// A datetime-local value (local time, minutes) for a date.
const localInput = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const CodeDialog = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("Store.promotions");
  const products = useQuery({
    ...orpc.store.products.queryOptions(),
    enabled: open,
  });
  const choices = (products.data ?? []).filter(
    (each) => each.status !== "retired"
  );
  const [picked, setPicked] = useState<ReadonlySet<string> | undefined>();
  // Live products by default: a code is for what buyers can order now.
  const chosen =
    picked ??
    new Set(
      choices.filter((each) => each.status === "public").map((each) => each.id)
    );
  const request = useRequest(onClose);
  const plan = useMutation(orpc.store.planPromotion.mutationOptions(request));
  // The default window starts when the dialog last opened.
  const [now, setNow] = useState(() => new Date());
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const maxUses = Number(form.get("maxUses"));
    plan.mutate({
      code: String(form.get("code")),
      endsAt: new Date(String(form.get("endsAt"))),
      maxUses: maxUses > 0 ? maxUses : undefined,
      percentage: Number(form.get("percentage")),
      productIds: [...chosen],
      startsAt: new Date(String(form.get("startsAt"))),
    });
  };
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setPicked(undefined);
          setNow(new Date());
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{t("newCode")}</DialogTitle>
            <DialogDescription>{t("codeLead")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="promo-code">{t("code")}</Label>
              <Input
                autoCapitalize="characters"
                className="uppercase"
                id="promo-code"
                name="code"
                pattern="[A-Za-z0-9]{3,24}"
                required
                title={t("codeHint")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-percentage">{t("percentage")}</Label>
              <Input
                defaultValue={DEFAULT_PERCENT}
                id="promo-percentage"
                max={90}
                min={1}
                name="percentage"
                required
                type="number"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-starts">{t("startsAt")}</Label>
              <Input
                defaultValue={localInput(now)}
                id="promo-starts"
                name="startsAt"
                required
                type="datetime-local"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-ends">{t("endsAt")}</Label>
              <Input
                defaultValue={localInput(
                  new Date(now.getTime() + WEEK_DAYS * DAY_MS)
                )}
                id="promo-ends"
                name="endsAt"
                required
                type="datetime-local"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-uses">{t("maxUses")}</Label>
              <Input
                id="promo-uses"
                max={1000}
                min={1}
                name="maxUses"
                type="number"
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              {t("products", { count: chosen.size })}
            </legend>
            {products.isPending ? <Skeleton className="h-16 w-full" /> : null}
            {products.isSuccess && choices.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noProducts")}</p>
            ) : null}
            <ul className="border-border max-h-44 overflow-y-auto rounded-lg border">
              {choices.map((each) => (
                <li
                  className="border-border flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                  key={each.id}
                >
                  <Checkbox
                    checked={chosen.has(each.id)}
                    id={`promo-${each.id}`}
                    onCheckedChange={(on) => {
                      const next = new Set(chosen);
                      if (on) {
                        next.add(each.id);
                      } else {
                        next.delete(each.id);
                      }
                      setPicked(next);
                    }}
                  />
                  <Label
                    className="min-w-0 flex-1 truncate font-normal"
                    htmlFor={`promo-${each.id}`}
                  >
                    {each.title}
                  </Label>
                </li>
              ))}
            </ul>
          </fieldset>
          <p className="text-muted-foreground text-xs">{t("lossNote")}</p>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              {t("back")}
            </Button>
            <Button
              disabled={plan.isPending || chosen.size === 0}
              type="submit"
            >
              {t("plan")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const GiftDialog = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("Store.promotions");
  const money = useMoney();
  const refresh = useRefresh();
  const [amount, setAmount] = useState(25);
  const [count, setCount] = useState(1);
  const [queued, setQueued] = useState<StoreApproval | undefined>();
  const close = () => {
    setQueued(undefined);
    onClose();
  };
  const issue = useMutation(
    orpc.store.issueGiftCards.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async (approval) => {
        await refresh();
        if (approval.status === "pending") {
          setQueued(approval);
        } else {
          close();
        }
      },
    })
  );
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("issue")}</DialogTitle>
          <DialogDescription>{t("giftLead")}</DialogDescription>
        </DialogHeader>
        {queued === undefined ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const expires = String(
                new FormData(event.currentTarget).get("expiresAt") ?? ""
              );
              issue.mutate({
                amountUsd: amount,
                count,
                expiresAt: expires === "" ? undefined : new Date(expires),
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gift-amount">{t("amount")}</Label>
                <Input
                  id="gift-amount"
                  max={2000}
                  min={1}
                  onChange={(event) =>
                    setAmount(Number(event.currentTarget.value))
                  }
                  required
                  type="number"
                  value={amount}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gift-count">{t("count")}</Label>
                <Input
                  id="gift-count"
                  max={50}
                  min={1}
                  onChange={(event) =>
                    setCount(Number(event.currentTarget.value))
                  }
                  required
                  type="number"
                  value={count}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gift-expires">{t("expires")}</Label>
                <Input id="gift-expires" name="expiresAt" type="date" />
              </div>
            </div>
            <p
              aria-live="polite"
              className="bg-muted figures rounded-lg p-3 text-sm"
            >
              {t("giftTotal", {
                total: money.dollars(
                  (Number.isFinite(amount) ? amount : 0) *
                    (Number.isFinite(count) ? count : 0)
                ),
              })}
            </p>
            <DialogFooter>
              <Button onClick={close} type="button" variant="outline">
                {t("back")}
              </Button>
              <Button disabled={issue.isPending} type="submit">
                {t("review")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <ConfirmApproval
            approval={queued}
            confirmLabel={t("confirmIssue")}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const Codes = () => {
  const t = useTranslations("Store.promotions");
  const query = useQuery(orpc.store.promotions.queryOptions({ input: {} }));
  const request = useRequest();
  const end = useMutation(orpc.store.endPromotion.mutationOptions(request));
  const [creating, setCreating] = useState(false);
  return (
    <section aria-labelledby="store-codes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-base font-semibold" id="store-codes">
            {t("codesTitle")}
          </h3>
          <p className="text-muted-foreground text-sm">{t("codesLead")}</p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          {t("newCode")}
        </Button>
      </div>
      {query.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {query.isError ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}
      {query.data?.length === 0 ? (
        <p className="border-input text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          {t("codesEmpty")}
        </p>
      ) : null}
      {query.data !== undefined && query.data.length > 0 ? (
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {query.data.map((promo) => (
            <li
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
              key={promo.id}
            >
              <span className="font-mono text-sm">{promo.code}</span>
              <span className="figures text-sm">
                {promo.percentage === null
                  ? null
                  : t("off", { percent: promo.percentage })}
              </span>
              <span className="text-muted-foreground figures text-xs">
                {promo.uses === null ? null : t("uses", { count: promo.uses })}
              </span>
              <span className="ms-auto text-sm">
                <StatusDot tone={PROMO_TONE[promo.status] ?? "muted"}>
                  {t(`status.${promo.status}`)}
                </StatusDot>
              </span>
              {promo.status === "LIVE" ? (
                <Button
                  disabled={end.isPending}
                  onClick={() =>
                    end.mutate({ code: promo.code, promotionId: promo.id })
                  }
                  size="sm"
                  variant="outline"
                >
                  {t("end")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <CodeDialog onClose={() => setCreating(false)} open={creating} />
    </section>
  );
};

const GiftCards = () => {
  const t = useTranslations("Store.promotions");
  const format = useFormatter();
  const money = useMoney();
  const query = useQuery(orpc.store.giftCards.queryOptions({ input: {} }));
  const [issuing, setIssuing] = useState(false);
  return (
    <section aria-labelledby="store-gifts" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-base font-semibold" id="store-gifts">
            {t("giftTitle")}
          </h3>
          <p className="text-muted-foreground text-sm">{t("giftLead")}</p>
        </div>
        <Button onClick={() => setIssuing(true)} size="sm" variant="outline">
          {t("issue")}
        </Button>
      </div>
      {query.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {query.isError ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}
      {query.data?.length === 0 ? (
        <p className="border-input text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          {t("giftEmpty")}
        </p>
      ) : null}
      {query.data !== undefined && query.data.length > 0 ? (
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {query.data.map((card) => (
            <li
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
              key={card.id}
            >
              <span className="font-mono text-sm">
                {card.code ?? t("group")}
              </span>
              <span className="figures text-sm">
                {t("balance", {
                  initial: money.cents(card.initialCents),
                  remaining: money.cents(card.remainingCents),
                })}
              </span>
              {card.expiresAt ? (
                <span className="text-muted-foreground text-xs">
                  {t("expiresOn", {
                    date: format.dateTime(new Date(card.expiresAt), {
                      dateStyle: "medium",
                    }),
                  })}
                </span>
              ) : null}
              <span className="ms-auto text-sm">
                <StatusDot tone={GIFT_TONE[card.status] ?? "muted"}>
                  {t(`giftStatus.${card.status}`)}
                </StatusDot>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <GiftDialog onClose={() => setIssuing(false)} open={issuing} />
    </section>
  );
};

export const StorePromotions = () => {
  const t = useTranslations("Store.promotions");
  return (
    <section aria-labelledby="store-promotions" className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            className="font-display text-lg font-semibold"
            id="store-promotions"
          >
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("lead")}</p>
        </div>
        <AdminLink page="promotions">{t("inFourthwall")}</AdminLink>
      </div>
      <Codes />
      <GiftCards />
    </section>
  );
};
