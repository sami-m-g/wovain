"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Skeleton } from "@wovain/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wovain/ui/components/tabs";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { ConnectState } from "@/components/app/connect-state";
import {
  StoreApprovals,
  usePendingStoreApprovals,
} from "@/components/store/store-approvals";
import { StoreOrders } from "@/components/store/store-orders";
import { StorePreview } from "@/components/store/store-preview";
import { StoreProducts } from "@/components/store/store-products";
import { StorePromotions } from "@/components/store/store-promotions";
import { AdminLink } from "@/components/store/store-shared";
import { StoreSummary } from "@/components/store/store-summary";
import { missingConnection } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const TABS = ["products", "orders", "promotions", "approvals"] as const;
type Tab = (typeof TABS)[number];

const isTab = (value: unknown): value is Tab => TABS.includes(value as Tab);

/** The open tab, kept in `?tab=` so a link or a reload lands on it. */
const useTab = () => {
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(initial) ? initial : "products");
  const select = (next: Tab) => {
    setTab(next);
    const query = new URLSearchParams(window.location.search);
    if (next === "products") {
      query.delete("tab");
    } else {
      query.set("tab", next);
    }
    const search = query.toString();
    window.history.replaceState(
      null,
      "",
      search === "" ? window.location.pathname : `?${search}`
    );
  };
  return [tab, select] as const;
};

const Header = ({ actions }: { actions?: ReactNode }) => {
  const t = useTranslations("Store");
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">{t("lead")}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
};

/**
 * The Store: one summary strip over four tabs (products, orders,
 * promotions, approvals). Simple by default, power one click away; every
 * write goes through the approval queue with its impact shown first.
 */
export const StoreDashboard = () => {
  const t = useTranslations("Store");
  const [tab, setTab] = useTab();
  const connections = useQuery(orpc.connections.list.queryOptions());
  const fourthwall = connections.data?.find(
    (each) => each.provider === "fourthwall"
  );
  const shopless =
    connections.isSuccess &&
    (fourthwall === undefined || fourthwall.needsReconnect);
  const readiness = useQuery({
    ...orpc.store.readiness.queryOptions(),
    enabled: connections.isSuccess && !shopless,
  });
  const pending = usePendingStoreApprovals();
  const missing = missingConnection(readiness.error);

  // Until Fourthwall is connected there is no shop to run: one connect
  // state, never an error.
  if (shopless || missing !== undefined) {
    return (
      <div className="flex flex-col gap-8">
        <Header />
        <section aria-labelledby="store-connect">
          <ConnectState
            body={t("readiness.connectBody")}
            headingId="store-connect"
            provider="fourthwall"
            reconnect={
              missing?.reconnect ?? fourthwall?.needsReconnect === true
            }
            title={
              (missing?.reconnect ?? fourthwall?.needsReconnect === true)
                ? undefined
                : t("readiness.connectTitle")
            }
          />
        </section>
      </div>
    );
  }

  const waiting = pending.data?.length ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <Header
        actions={
          readiness.data ? (
            <>
              <StorePreview shop={readiness.data.shop} />
              <AdminLink page="home" variant="ghost" />
            </>
          ) : null
        }
      />
      {readiness.isPending ? (
        <Skeleton className="h-36 w-full rounded-xl" />
      ) : null}
      {readiness.isError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{readiness.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {readiness.data ? (
        <StoreSummary
          onApprovals={() => setTab("approvals")}
          readiness={readiness.data}
        />
      ) : null}
      <Tabs
        className="gap-6"
        onValueChange={(value) => {
          if (isTab(value)) {
            setTab(value);
          }
        }}
        value={tab}
      >
        <div className="border-border -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-11 gap-4" variant="line">
            {TABS.map((each) => (
              <TabsTrigger
                className="h-11 flex-none px-1"
                key={each}
                value={each}
              >
                {t(`tabs.${each}`)}
                {each === "approvals" && waiting > 0 ? (
                  <span className="bg-muted text-foreground figures rounded-full px-1.5 text-xs">
                    {waiting}
                    <span className="sr-only"> {t("tabs.waiting")}</span>
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="products">
          <StoreProducts />
        </TabsContent>
        <TabsContent value="orders">
          <StoreOrders />
        </TabsContent>
        <TabsContent value="promotions">
          <StorePromotions />
        </TabsContent>
        <TabsContent value="approvals">
          <StoreApprovals />
        </TabsContent>
      </Tabs>
    </div>
  );
};
