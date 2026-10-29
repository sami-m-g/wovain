"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { Label } from "@wovain/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@wovain/ui/components/sheet";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Switch } from "@wovain/ui/components/switch";
import { cn } from "@wovain/ui/lib/utils";
import { Eye, ExternalLink, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { AdminLink, useMoney } from "@/components/store/store-shared";
import type { StoreProduct } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const TILE = 320;

const Tile = ({ product }: { product: StoreProduct }) => {
  const t = useTranslations("Store.preview");
  const money = useMoney();
  const [mockup] = product.mockups;
  const draft = product.status !== "public";
  return (
    <li className="flex flex-col gap-2">
      <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
        {mockup ? (
          <Image
            alt={t("mockupAlt", { title: product.title })}
            className="size-full object-contain"
            height={TILE}
            src={mockup}
            unoptimized
            width={TILE}
          />
        ) : (
          <span className="text-muted-foreground grid size-full place-items-center">
            <ImageOff aria-hidden="true" className="size-5" />
          </span>
        )}
        {draft ? (
          <span className="bg-background/90 absolute start-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium">
            {t("notLive")}
          </span>
        ) : null}
      </div>
      <div>
        <p className="line-clamp-2 text-sm font-medium">{product.title}</p>
        <p className="figures text-muted-foreground text-sm">
          {money.dollars(product.price)}
        </p>
      </div>
    </li>
  );
};

/**
 * How the shop looks to buyers. Fourthwall storefronts can't be framed
 * (their CSP allows only Fourthwall's own domains), so the preview is the
 * shop's product renders from Fourthwall's design previews, laid out as a
 * storefront grid, with links to the real storefront and the site editor.
 */
export const StorePreview = ({
  shop,
}: {
  shop: {
    baseUrl: string | null;
    name: string | null;
    siteStatus: string | null;
  };
}) => {
  const t = useTranslations("Store.preview");
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(false);
  const products = useQuery({
    ...orpc.store.products.queryOptions(),
    enabled: open,
  });
  const shown = (products.data ?? []).filter(
    (each) =>
      each.status === "public" ||
      (drafts && each.status !== "retired" && each.status !== "paused")
  );
  const live = shop.siteStatus === "LIVE";
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <Eye aria-hidden="true" />
        {t("open")}
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-border border-b">
            <SheetTitle className="font-display text-lg">
              {shop.name === null
                ? t("titleFallback")
                : t("title", { name: shop.name })}
            </SheetTitle>
            <SheetDescription>{t("lead")}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">
            {live ? null : (
              <p className="bg-muted rounded-lg p-3 text-sm">
                {shop.siteStatus === "PASSWORD_PROTECTED"
                  ? t("password")
                  : t("comingSoon")}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={drafts}
                id="preview-drafts"
                onCheckedChange={setDrafts}
              />
              <Label className="font-normal" htmlFor="preview-drafts">
                {t("includeDrafts")}
              </Label>
            </div>
            {products.isPending ? (
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="aspect-square w-full" />
              </div>
            ) : null}
            {products.isError ? (
              <p className="text-destructive text-sm">
                {products.error.message}
              </p>
            ) : null}
            {products.isSuccess && shown.length === 0 ? (
              <p className="border-input text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                {t("empty")}
              </p>
            ) : null}
            {shown.length > 0 ? (
              <ul
                aria-label={t("gridLabel")}
                className="grid grid-cols-2 gap-x-4 gap-y-6"
              >
                {shown.map((product) => (
                  <Tile key={product.id} product={product} />
                ))}
              </ul>
            ) : null}
            <p className="text-muted-foreground text-xs">{t("note")}</p>
            <div className="flex flex-wrap gap-2">
              {shop.baseUrl ? (
                <a
                  className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                  href={shop.baseUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {live ? t("openStore") : t("openPlaceholder")}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{t("newTab")}</span>
                </a>
              ) : null}
              <AdminLink page="storeDesign" variant="outline">
                {t("editDesign")}
              </AdminLink>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
