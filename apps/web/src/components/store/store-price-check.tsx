"use client";

import { useQuery } from "@tanstack/react-query";
import { checkPrice, DTC_GROSS_MARGIN } from "@wovain/core/price-check";
import type { PriceVerdict } from "@wovain/core/price-check";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { useFormatter, useTranslations } from "next-intl";

import { useMoney } from "@/components/store/store-shared";
import { orpc } from "@/utils/orpc";

const VERDICT_TONE: Record<PriceVerdict, string> = {
  below_floor: "text-warning",
  healthy: "text-success",
  loss: "text-destructive",
  thin: "text-warning",
};

/**
 * The price against what Fourthwall charges to make each size: profit
 * and margin per size as the merchant types, wovain's floor and the 60%
 * gross margin DTC stores keep to pay for ads, each one click away.
 */
export const PriceCheck = ({
  productId,
  price,
  onPick,
}: {
  productId: string;
  price: number;
  onPick: (price: number) => void;
}) => {
  const t = useTranslations("Store.priceCheck");
  const format = useFormatter();
  const money = useMoney();
  const costs = useQuery(
    orpc.store.priceCheck.queryOptions({ input: { productId } })
  );
  if (costs.isPending) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }
  if (costs.isError) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("unavailable", { reason: costs.error.message })}
      </p>
    );
  }
  const check = checkPrice(costs.data.rules, price, costs.data.costs);
  if (check === undefined) {
    return <p className="text-muted-foreground text-xs">{t("noCost")}</p>;
  }
  const percent = (value: number) =>
    format.number(value, { maximumFractionDigits: 0, style: "percent" });
  return (
    <section aria-label={t("label")} className="flex flex-col gap-2">
      <p
        aria-live="polite"
        className={cn("text-sm font-medium", VERDICT_TONE[check.verdict])}
      >
        {t(`verdict.${check.verdict}`, {
          margin: percent(DTC_GROSS_MARGIN),
          // "loses $2.00", not "loses -$2.00".
          profit: money.dollars(Math.abs(check.worst.profit)),
          size: check.worst.size,
        })}
      </p>
      <table className="figures w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-start font-medium" scope="col">
              {t("size")}
            </th>
            <th className="text-end font-medium" scope="col">
              {t("cost")}
            </th>
            <th className="text-end font-medium" scope="col">
              {t("price")}
            </th>
            <th className="text-end font-medium" scope="col">
              {t("profit")}
            </th>
            <th className="text-end font-medium" scope="col">
              {t("margin")}
            </th>
          </tr>
        </thead>
        <tbody>
          {check.sizes.map((line) => (
            <tr key={line.size}>
              <th className="text-start font-normal" scope="row">
                {line.size}
              </th>
              <td className="text-end">{money.dollars(line.cost)}</td>
              <td className="text-end">{money.dollars(line.price)}</td>
              <td
                className={cn(
                  "text-end",
                  line.profit < 0 && "text-destructive"
                )}
              >
                {money.dollars(line.profit)}
              </td>
              <td className="text-end">{percent(line.grossMargin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        {price === check.floorPrice ? null : (
          <Button
            onClick={() => onPick(check.floorPrice)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("useFloor", { price: money.dollars(check.floorPrice) })}
          </Button>
        )}
        {price === check.benchmarkPrice ? null : (
          <Button
            onClick={() => onPick(check.benchmarkPrice)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("useBenchmark", {
              margin: percent(DTC_GROSS_MARGIN),
              price: money.dollars(check.benchmarkPrice),
            })}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{t("source")}</p>
    </section>
  );
};
