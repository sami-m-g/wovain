import { getFormatter, getTranslations } from "next-intl/server";

import { EXAMPLE_BASE_COSTS, priceBreakdown } from "@/lib/pricing";

/** The price wovain sets for common blank costs, computed from the real rule. */
export const PriceTable = async ({ caption }: { caption: string }) => {
  const t = await getTranslations("Home");
  const format = await getFormatter();
  const money = (value: number, whole = false) =>
    format.number(value, {
      currency: "USD",
      maximumFractionDigits: whole ? 0 : 2,
      minimumFractionDigits: whole ? 0 : 2,
      style: "currency",
    });
  const rows = EXAMPLE_BASE_COSTS.map((cost) => priceBreakdown(cost));
  return (
    <div className="border-border bg-card overflow-x-auto rounded-2xl border">
      <table className="figures w-full text-sm">
        <caption className="border-border border-b px-5 py-4 text-start font-medium">
          {caption}
        </caption>
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="px-5 py-3 text-start font-medium" scope="col">
              {t("tableBlank")}
            </th>
            <th className="px-5 py-3 text-end font-medium" scope="col">
              {t("tablePrice")}
            </th>
            <th className="px-5 py-3 text-end font-medium" scope="col">
              {t("tableProfit")}
            </th>
            <th className="px-5 py-3 text-end font-medium" scope="col">
              {t("tableMargin")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-border border-t" key={row.baseCost}>
              <th className="px-5 py-3 text-start font-normal" scope="row">
                {money(row.baseCost)}
              </th>
              <td className="px-5 py-3 text-end font-semibold">
                {money(row.price, true)}
              </td>
              <td className="text-success px-5 py-3 text-end font-medium">
                {money(row.profit)}
              </td>
              <td className="px-5 py-3 text-end">{row.marginPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
