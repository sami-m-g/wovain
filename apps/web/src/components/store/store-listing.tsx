"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wovain/ui/components/dialog";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { ImageOff, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { ReactNode } from "react";

import { useMoney, useRequest } from "@/components/store/store-shared";
import type { StoreListingDraft, StoreProduct } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const MOCKUP = 240;

/** One side of the before-and-after: the product page as a buyer sees it. */
const Page = ({
  label,
  image,
  title,
  price,
  highlight,
  children,
}: {
  label: string;
  image: string | null;
  title: string;
  price: number;
  highlight?: boolean;
  children: ReactNode;
}) => {
  const t = useTranslations("Store.listing");
  const money = useMoney();
  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border p-3",
        highlight && "border-primary bg-accent-soft"
      )}
    >
      <figcaption className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </figcaption>
      <div className="bg-muted aspect-square w-full overflow-hidden rounded-lg">
        {image ? (
          <Image
            alt={t("mockupAlt", { title })}
            className="size-full object-contain"
            height={MOCKUP}
            src={image}
            unoptimized
            width={MOCKUP}
          />
        ) : (
          <span className="text-muted-foreground grid size-full place-items-center">
            <ImageOff aria-hidden="true" className="size-5" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-base leading-snug font-semibold">
          {title}
        </p>
        <p className="figures text-sm">{money.dollars(price)}</p>
      </div>
      <div className="text-muted-foreground flex flex-col gap-2 text-sm">
        {children}
      </div>
    </figure>
  );
};

const Proposed = ({ draft }: { draft: StoreListingDraft }) => {
  const t = useTranslations("Store.listing");
  return (
    <Page
      highlight
      image={draft.image}
      label={t("after")}
      price={draft.price}
      title={draft.proposed.title}
    >
      <p className="text-foreground">{draft.proposed.hook}</p>
      <ul className="list-disc ps-5">
        {draft.proposed.benefits.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{draft.trust.join(" ")}</p>
    </Page>
  );
};

/**
 * Rewrites a product page the way an expert copywriter would and shows it
 * next to the current one, as the buyer sees it. Approving queues
 * store.listing.edit; nothing changes in the shop before that.
 */
export const ListingDialog = ({
  product,
  onClose,
}: {
  product: StoreProduct | undefined;
  onClose: () => void;
}) => {
  const t = useTranslations("Store.listing");
  const draft = useQuery({
    ...orpc.store.draftListing.queryOptions({
      input: { productId: product?.id ?? "" },
    }),
    enabled: product !== undefined,
    gcTime: 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const request = useRequest(onClose);
  const edit = useMutation(orpc.store.editListing.mutationOptions(request));
  const issues = draft.data?.issues ?? [];
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={product !== undefined}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        {product === undefined ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title", { title: product.title })}</DialogTitle>
              <DialogDescription>{t("note")}</DialogDescription>
            </DialogHeader>
            {draft.isPending ? (
              <div aria-busy="true" className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-80 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
                <p className="text-muted-foreground text-sm sm:col-span-2">
                  {t("writing")}
                </p>
              </div>
            ) : null}
            {draft.isError ? (
              <p className="text-destructive text-sm" role="alert">
                {draft.error.message}
              </p>
            ) : null}
            {draft.data === undefined ? null : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Page
                  image={draft.data.image}
                  label={t("before")}
                  price={draft.data.price}
                  title={draft.data.current.title}
                >
                  <p>{draft.data.current.description || t("noDescription")}</p>
                </Page>
                <Proposed draft={draft.data} />
              </div>
            )}
            {issues.length > 0 ? (
              <p
                aria-live="polite"
                className="text-warning flex items-start gap-2 text-sm"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                {t("issues", {
                  list: issues.map((issue) => t(`issue.${issue}`)).join(", "),
                })}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">{t("practice")}</p>
            <DialogFooter>
              <Button onClick={onClose} type="button" variant="outline">
                {t("back")}
              </Button>
              <Button
                disabled={draft.isFetching}
                onClick={async () => {
                  await draft.refetch();
                }}
                type="button"
                variant="outline"
              >
                {t("again")}
              </Button>
              <Button
                disabled={draft.data === undefined || edit.isPending}
                onClick={() => {
                  if (draft.data !== undefined) {
                    edit.mutate({
                      listing: draft.data.proposed,
                      productId: product.id,
                    });
                  }
                }}
                type="button"
              >
                {t("confirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
