"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { checkPrice } from "@wovain/core/price-check";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wovain/ui/components/dropdown-menu";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { Skeleton } from "@wovain/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import { cn } from "@wovain/ui/lib/utils";
import { ImageOff, MoreHorizontal, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { ListingDialog } from "@/components/store/store-listing";
import { PriceCheck } from "@/components/store/store-price-check";
import type { Tone } from "@/components/store/store-shared";
import {
  AdminLink,
  DASH,
  StatusDot,
  useMoney,
  useRefresh,
  useRequest,
} from "@/components/store/store-shared";
import { Link } from "@/i18n/navigation";
import type { StoreProduct } from "@/lib/flow-client";
import { fourthwallAdminUrl } from "@/lib/fourthwall-admin";
import { orpc } from "@/utils/orpc";

const THUMB = 48;
const PERCENT = 100;

type Status = StoreProduct["status"];
type Move = "publish" | "unpublish" | "retire";

const MOVES: Record<Status, Move[]> = {
  hidden: ["publish", "retire"],
  in_review: ["publish", "retire"],
  paused: ["publish", "retire"],
  public: ["unpublish", "retire"],
  retired: [],
};

const STATUS_TONE: Record<Status, Tone> = {
  hidden: "muted",
  in_review: "muted",
  paused: "muted",
  public: "success",
  retired: "danger",
};

const FILTERS = ["all", "live", "drafts", "paused", "retired"] as const;
type Filter = (typeof FILTERS)[number];

const IN_FILTER: Record<Filter, (status: Status) => boolean> = {
  all: (status) => status !== "retired",
  drafts: (status) => status === "hidden" || status === "in_review",
  live: (status) => status === "public",
  paused: (status) => status === "paused",
  retired: (status) => status === "retired",
};

const normal = (text: string) => text.trim().toLowerCase();

/**
 * Units sold and margin per product, from Fourthwall's top-products
 * report over 28 days, matched by the product's name.
 */
const useSalesByTitle = () => {
  const sales = useQuery(
    orpc.store.sales.queryOptions({ input: { range: "28d" } })
  );
  const byTitle = new Map(
    (sales.data?.products ?? []).map((row) => [normal(row.name), row])
  );
  return {
    for: (title: string) => byTitle.get(normal(title)),
    ready: sales.isSuccess,
  };
};

// ---------------------------------------------------------------------------
// Dialogs: every write shows its impact before it goes to the approvals

const MoveDialog = ({
  move,
  products,
  onClose,
}: {
  move: Move | undefined;
  products: StoreProduct[];
  onClose: (done: boolean) => void;
}) => {
  const t = useTranslations("Store.impact");
  const actions = useTranslations("Store.products.move");
  const refresh = useRefresh();
  const request = useMutation(orpc.store.moveProduct.mutationOptions());
  const decide = useMutation(orpc.approvals.decide.mutationOptions());
  const [busy, setBusy] = useState(false);
  const eligible =
    move === undefined
      ? []
      : products.filter((each) => MOVES[each.status].includes(move));
  const count = eligible.length;
  const skipped = products.length - count;

  const run = async () => {
    if (move === undefined) {
      return;
    }
    setBusy(true);
    let queued = 0;
    let failed = 0;
    // One request at a time: each becomes its own approval, and Fourthwall
    // rate-limits writes per shop.
    for (const each of eligible) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
        const approval = await request.mutateAsync({
          move,
          productId: each.id,
        });
        // Retiring is R3: it waits for an explicit confirm, which this
        // dialog, with its impact, is.
        const settled =
          approval.status === "pending" && move === "retire"
            ? // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
              await decide.mutateAsync({
                approvalId: approval.id,
                approve: true,
              })
            : approval;
        if (settled.status === "pending") {
          queued += 1;
        }
      } catch (error) {
        failed += 1;
        toast.error(error instanceof Error ? error.message : String(error));
      }
    }
    setBusy(false);
    await refresh();
    if (failed < count) {
      toast.success(
        queued > 0 ? t("queuedCount", { count: queued }) : t("sent")
      );
    }
    onClose(true);
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
      open={move !== undefined}
    >
      <DialogContent>
        {move === undefined ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{t(`${move}.title`, { count })}</DialogTitle>
              <DialogDescription>
                {t(`${move}.body`, { count })}
              </DialogDescription>
            </DialogHeader>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
              {eligible.map((each) => (
                <li className="truncate" key={each.id}>
                  {each.title}
                </li>
              ))}
            </ul>
            {skipped > 0 ? (
              <p className="text-muted-foreground text-xs">
                {t("skipped", { count: skipped })}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">{t("logged")}</p>
            <DialogFooter>
              <Button
                onClick={() => onClose(false)}
                type="button"
                variant="outline"
              >
                {t("back")}
              </Button>
              <Button
                disabled={busy || count === 0}
                onClick={run}
                type="button"
                variant={move === "retire" ? "destructive" : "default"}
              >
                {actions(move)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const RepriceDialog = ({
  product,
  onClose,
}: {
  product: StoreProduct | undefined;
  onClose: () => void;
}) => {
  const t = useTranslations("Store.reprice");
  const money = useMoney();
  const request = useRequest(onClose);
  const reprice = useMutation(orpc.store.reprice.mutationOptions(request));
  const [price, setPrice] = useState<number | undefined>();
  const current = product?.price ?? 0;
  const next = price ?? current;
  const diff = next - current;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setPrice(undefined);
          onClose();
        }
      }}
      open={product !== undefined}
    >
      <DialogContent>
        {product === undefined ? null : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              reprice.mutate({ price: next, productId: product.id });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("title", { title: product.title })}</DialogTitle>
              <DialogDescription>{t("note")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reprice-price">{t("price")}</Label>
              <Input
                className="w-32"
                id="reprice-price"
                max={1000}
                min={1}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setPrice(Number.isFinite(value) ? value : undefined);
                }}
                required
                step="0.01"
                type="number"
                value={next}
              />
            </div>
            <PriceCheck onPick={setPrice} price={next} productId={product.id} />
            <dl className="bg-muted figures grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg p-3 text-sm">
              <dt className="text-muted-foreground">{t("now")}</dt>
              <dd className="text-end">{money.dollars(current)}</dd>
              <dt className="text-muted-foreground">{t("after")}</dt>
              <dd className="text-end font-medium">{money.dollars(next)}</dd>
            </dl>
            <p aria-live="polite" className="text-muted-foreground text-xs">
              {diff === 0
                ? t("same")
                : t(diff > 0 ? "up" : "down", {
                    amount: money.dollars(Math.abs(diff)),
                  })}
            </p>
            <DialogFooter>
              <Button onClick={onClose} type="button" variant="outline">
                {t("back")}
              </Button>
              <Button disabled={reprice.isPending || diff === 0} type="submit">
                {t("confirm")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

const SampleDialog = ({
  product,
  onClose,
}: {
  product: StoreProduct | undefined;
  onClose: () => void;
}) => {
  const t = useTranslations("Store.sample");
  const money = useMoney();
  const variants = useQuery({
    ...orpc.store.variants.queryOptions({
      input: { productId: product?.id ?? "" },
    }),
    enabled: product !== undefined,
  });
  const sample = useMutation(
    orpc.store.sample.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: ({ url }) => {
        window.open(url, "_blank", "noopener");
        onClose();
      },
    })
  );
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={product !== undefined}
    >
      <DialogContent>
        {product === undefined ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title", { title: product.title })}</DialogTitle>
              <DialogDescription>{t("body")}</DialogDescription>
            </DialogHeader>
            {variants.isPending ? <Skeleton className="h-9 w-full" /> : null}
            {variants.isError ? (
              <p className="text-destructive text-sm">
                {variants.error.message}
              </p>
            ) : null}
            {variants.data?.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("none")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {variants.data?.map((variant) => (
                <Button
                  disabled={sample.isPending}
                  key={variant.id}
                  onClick={() =>
                    sample.mutate({
                      productId: product.id,
                      variantId: variant.id,
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  {variant.name}
                  {variant.priceCents === undefined ? null : (
                    <span className="text-muted-foreground figures">
                      {money.cents(variant.priceCents)}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// The list

const Thumb = ({ product }: { product: StoreProduct }) => {
  const t = useTranslations("Store.products");
  const [mockup] = product.mockups;
  if (mockup === undefined) {
    return (
      <span className="bg-muted text-muted-foreground grid size-12 shrink-0 place-items-center rounded-md">
        <ImageOff aria-hidden="true" className="size-4" />
      </span>
    );
  }
  return (
    <Image
      alt={t("mockupAlt", { title: product.title })}
      className="bg-muted size-12 shrink-0 rounded-md object-contain"
      height={THUMB}
      src={mockup}
      unoptimized
      width={THUMB}
    />
  );
};

/**
 * Before a sale: the margin the price leaves on Fourthwall's cost to make
 * it (its cheapest size), from the price check.
 */
const ExpectedMargin = ({ product }: { product: StoreProduct }) => {
  const t = useTranslations("Store.products");
  const format = useFormatter();
  const costs = useQuery({
    ...orpc.store.priceCheck.queryOptions({ input: { productId: product.id } }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const check = costs.data
    ? checkPrice(costs.data.rules, product.price, costs.data.costs)
    : undefined;
  const [base] = (check?.sizes ?? []).toSorted((a, b) => a.cost - b.cost);
  if (base === undefined) {
    return DASH;
  }
  return (
    <span className="flex flex-col">
      {format.number(base.grossMargin, {
        maximumFractionDigits: 0,
        style: "percent",
      })}
      <span className="text-xs">{t("expected")}</span>
    </span>
  );
};

const openTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

const RowMenu = ({
  product,
  onMove,
  onReprice,
  onRewrite,
  onSample,
}: {
  product: StoreProduct;
  onMove: (move: Move) => void;
  onReprice: () => void;
  onRewrite: () => void;
  onSample: () => void;
}) => {
  const t = useTranslations("Store.products");
  const live = product.status === "public" && product.productUrl;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("actions", { title: product.title })}
            className="size-9"
            size="icon"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {MOVES[product.status].map((move) => (
          <DropdownMenuItem
            key={move}
            onClick={() => onMove(move)}
            variant={move === "retire" ? "destructive" : "default"}
          >
            {t(`move.${move}`)}
          </DropdownMenuItem>
        ))}
        {product.status === "retired" ? null : (
          <>
            <DropdownMenuItem onClick={onRewrite}>
              {t("rewrite")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReprice}>
              {t("reprice")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSample}>
              {t("sample")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {live ? (
          <DropdownMenuItem onClick={() => openTab(live)}>
            {t("view")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => openTab(fourthwallAdminUrl("products"))}
        >
          {t("editInFourthwall")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ProductRow = ({
  product,
  selected,
  onSelect,
  sold,
  onMove,
  onReprice,
  onRewrite,
  onSample,
}: {
  product: StoreProduct;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  sold: { margin: number | undefined; unitsSold: number } | undefined;
  onMove: (move: Move) => void;
  onReprice: () => void;
  onRewrite: () => void;
  onSample: () => void;
}) => {
  const t = useTranslations("Store.products");
  const status = useTranslations("Store.productStatus");
  const format = useFormatter();
  const money = useMoney();
  const checkboxId = `select-${product.id}`;
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_7rem_5rem_5rem_4rem_auto]",
        selected && "bg-accent-soft"
      )}
    >
      <Checkbox
        aria-label={t("select", { title: product.title })}
        checked={selected}
        id={checkboxId}
        onCheckedChange={(checked) => onSelect(checked)}
      />
      <Thumb product={product} />
      <div className="min-w-0">
        <p className="truncate font-medium">{product.title}</p>
        {product.runId && product.dropName ? (
          <Link
            className="text-muted-foreground hover:text-foreground block truncate text-xs underline-offset-4 hover:underline"
            href={`/dashboard?run=${encodeURIComponent(product.runId)}`}
          >
            {t("fromDrop", { name: product.dropName })}
          </Link>
        ) : null}
        {/* Phones: the figures under the title. */}
        <p className="text-muted-foreground figures text-xs sm:hidden">
          <StatusDot tone={STATUS_TONE[product.status]}>
            {status(product.status)}
          </StatusDot>
          {" · "}
          {money.dollars(product.price)}
          {sold ? ` · ${t("soldShort", { count: sold.unitsSold })}` : null}
        </p>
      </div>
      <span className="hidden text-sm sm:block">
        <StatusDot tone={STATUS_TONE[product.status]}>
          {status(product.status)}
        </StatusDot>
      </span>
      <span className="figures hidden text-end text-sm sm:block">
        {money.dollars(product.price)}
      </span>
      <span className="figures text-muted-foreground hidden text-end text-sm sm:block">
        {sold?.margin === undefined ? (
          <ExpectedMargin product={product} />
        ) : (
          format.number(sold.margin / PERCENT, {
            maximumFractionDigits: 0,
            style: "percent",
          })
        )}
      </span>
      <span className="figures hidden text-end text-sm sm:block">
        {sold === undefined ? DASH : format.number(sold.unitsSold)}
      </span>
      <RowMenu
        onMove={onMove}
        onReprice={onReprice}
        onRewrite={onRewrite}
        onSample={onSample}
        product={product}
      />
    </li>
  );
};

export const StoreProducts = () => {
  const t = useTranslations("Store.products");
  const query = useQuery(orpc.store.products.queryOptions());
  const sales = useSalesByTitle();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [moving, setMoving] = useState<
    { move: Move; products: StoreProduct[] } | undefined
  >();
  const [repricing, setRepricing] = useState<StoreProduct | undefined>();
  const [sampling, setSampling] = useState<StoreProduct | undefined>();
  const [rewriting, setRewriting] = useState<StoreProduct | undefined>();

  const all = query.data ?? [];
  const shown = all.filter(
    (each) =>
      IN_FILTER[filter](each.status) &&
      (search === "" || normal(each.title).includes(normal(search)))
  );
  const picked = all.filter((each) => selected.has(each.id));
  const allShownPicked =
    shown.length > 0 && shown.every((each) => selected.has(each.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  const counts = Object.fromEntries(
    FILTERS.map((each) => [
      each,
      all.filter((row) => IN_FILTER[each](row.status)).length,
    ])
  ) as Record<Filter, number>;

  return (
    <section aria-labelledby="store-products" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            className="font-display text-lg font-semibold"
            id="store-products"
          >
            {t("title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("lead")}</p>
        </div>
        <AdminLink page="products">{t("allInFourthwall")}</AdminLink>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          aria-label={t("filterLabel")}
          className="flex-wrap"
          onValueChange={(value) => {
            const [next] = value;
            if (FILTERS.includes(next as Filter)) {
              setFilter(next as Filter);
            }
          }}
          value={[filter]}
          variant="outline"
        >
          {FILTERS.map((each) => (
            <ToggleGroupItem
              className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-9 px-3"
              key={each}
              value={each}
            >
              {t(`filter.${each}`)}
              <span className="text-muted-foreground figures ms-1 text-xs">
                {counts[each]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative sm:w-56">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            aria-label={t("search")}
            className="ps-9"
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t("search")}
            type="search"
            value={search}
          />
        </div>
      </div>

      {picked.length > 0 ? (
        <section
          aria-label={t("bulkLabel")}
          aria-live="polite"
          className="border-primary bg-accent-soft flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2"
        >
          <span className="me-auto text-sm font-medium">
            {t("selected", { count: picked.length })}
          </span>
          {(["publish", "unpublish", "retire"] as const).map((move) => (
            <Button
              key={move}
              onClick={() => setMoving({ move, products: picked })}
              size="sm"
              variant={move === "retire" ? "destructive" : "outline"}
            >
              {t(`move.${move}`)}
            </Button>
          ))}
          <Button
            onClick={() => setSelected(new Set())}
            size="sm"
            variant="ghost"
          >
            {t("clear")}
          </Button>
        </section>
      ) : null}

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : null}
      {query.isError ? (
        <p className="text-destructive text-sm">{query.error.message}</p>
      ) : null}
      {query.isSuccess && all.length === 0 ? (
        <div className="border-input flex flex-col items-start gap-2 rounded-xl border border-dashed p-6">
          <p className="font-medium">{t("empty")}</p>
          <p className="text-muted-foreground text-sm">{t("emptyBody")}</p>
          <Link
            className="text-sm underline underline-offset-4"
            href="/dashboard/new"
          >
            {t("emptyAction")}
          </Link>
        </div>
      ) : null}
      {query.isSuccess && all.length > 0 && shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("emptyFiltered")}</p>
      ) : null}

      {shown.length > 0 ? (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="text-muted-foreground bg-muted/60 border-border grid grid-cols-[auto_1fr] items-center gap-x-3 border-b px-4 py-2 text-xs font-medium sm:grid-cols-[auto_3rem_minmax(0,1fr)_7rem_5rem_5rem_4rem_2.25rem]">
            <Checkbox
              aria-label={t("selectAll")}
              checked={allShownPicked}
              onCheckedChange={(checked) =>
                setSelected((current) => {
                  const next = new Set(current);
                  for (const each of shown) {
                    if (checked) {
                      next.add(each.id);
                    } else {
                      next.delete(each.id);
                    }
                  }
                  return next;
                })
              }
            />
            <span className="sm:hidden">{t("selectAll")}</span>
            <span aria-hidden="true" className="hidden sm:block" />
            <span className="hidden sm:block">{t("column.product")}</span>
            <span className="hidden sm:block">{t("column.status")}</span>
            <span className="hidden text-end sm:block">
              {t("column.price")}
            </span>
            <span className="hidden text-end sm:block">
              {t("column.margin")}
            </span>
            <span className="hidden text-end sm:block">{t("column.sold")}</span>
            <span aria-hidden="true" className="hidden sm:block" />
          </div>
          <ul className="divide-border divide-y">
            {shown.map((product) => (
              <ProductRow
                key={product.id}
                onMove={(move) => setMoving({ move, products: [product] })}
                onReprice={() => setRepricing(product)}
                onRewrite={() => setRewriting(product)}
                onSample={() => setSampling(product)}
                onSelect={(on) => toggle(product.id, on)}
                product={product}
                selected={selected.has(product.id)}
                sold={sales.for(product.title)}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {sales.ready ? (
        <p className="text-muted-foreground text-xs">{t("salesSource")}</p>
      ) : null}

      <MoveDialog
        move={moving?.move}
        onClose={(done) => {
          if (done) {
            setSelected(new Set());
          }
          setMoving(undefined);
        }}
        products={moving?.products ?? []}
      />
      <RepriceDialog
        onClose={() => setRepricing(undefined)}
        product={repricing}
      />
      <SampleDialog onClose={() => setSampling(undefined)} product={sampling} />
      <ListingDialog
        onClose={() => setRewriting(undefined)}
        product={rewriting}
      />
    </section>
  );
};
