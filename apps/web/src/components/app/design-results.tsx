"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { useFormatter, useTranslations } from "next-intl";

import { orpc } from "@/utils/orpc";

/**
 * A drop's test campaign, design by design (openspec ads-design-test):
 * spend, CTR, add-to-carts, purchases and profit, and where the profit
 * rules have each design: testing, paused (and why) or the winner they
 * scale. Hidden until Meta has numbers.
 */

const CENTS = 100;
const PERCENT = 100;
// Meta's numbers move slowly; the optimizer reads them every 30 minutes.
const REFRESH_MS = 300_000;

export const DesignResults = ({ campaignId }: { campaignId: string }) => {
  const t = useTranslations("Wizard.done.media.designs");
  const format = useFormatter();
  const results = useQuery({
    ...orpc.campaigns.designs.queryOptions({ input: { campaignId } }),
    refetchInterval: REFRESH_MS,
  });
  const { data } = results;
  if (data === undefined || !data.live) {
    return null;
  }
  const money = (cents: number) =>
    format.number(cents / CENTS, { currency: "USD", style: "currency" });
  return (
    <section aria-label={t("title")} className="flex flex-col gap-2 text-sm">
      <p className="font-medium">{t("title")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-start">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pe-3 text-start font-normal" scope="col">
                {t("design")}
              </th>
              <th className="py-1 pe-3 text-end font-normal" scope="col">
                {t("spend")}
              </th>
              <th className="py-1 pe-3 text-end font-normal" scope="col">
                {t("ctr")}
              </th>
              <th className="py-1 pe-3 text-end font-normal" scope="col">
                {t("addToCarts")}
              </th>
              <th className="py-1 pe-3 text-end font-normal" scope="col">
                {t("purchases")}
              </th>
              <th className="py-1 pe-3 text-end font-normal" scope="col">
                {t("profit")}
              </th>
              <th className="py-1 text-start font-normal" scope="col">
                {t("status")}
              </th>
            </tr>
          </thead>
          <tbody className="figures">
            {data.designs.map((design, index) => (
              <tr className="border-border border-t" key={design.productId}>
                <th className="py-2 pe-3 text-start font-medium" scope="row">
                  {design.title ?? t("numbered", { number: index + 1 })}
                </th>
                <td className="py-2 pe-3 text-end">
                  {money(design.spendCents)}
                </td>
                <td className="py-2 pe-3 text-end">
                  {format.number(design.ctr * PERCENT, {
                    maximumFractionDigits: 2,
                  })}
                  %
                </td>
                <td className="py-2 pe-3 text-end">
                  {format.number(design.addToCarts)}
                </td>
                <td className="py-2 pe-3 text-end">
                  {format.number(design.purchases)}
                </td>
                <td className="py-2 pe-3 text-end">
                  {money(design.profitCents)}
                </td>
                <td className="py-2">
                  {design.status.state === "paused" ? (
                    <span className="flex flex-col gap-0.5">
                      <Badge variant="outline">{t("paused")}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {design.status.reason}
                      </span>
                    </span>
                  ) : (
                    <Badge
                      variant={
                        design.status.state === "winner"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {t(design.status.state)}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
