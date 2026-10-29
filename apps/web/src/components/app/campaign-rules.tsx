"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { orpc } from "@/utils/orpc";

/**
 * The ads profit rules in plain words, where the merchant starts a campaign
 * (openspec change ads-profit-rules): when wovain pauses an ad or every
 * campaign, and when it asks to raise a budget, in this product's numbers.
 * The merchant sets the loss limit here. Hidden while the flag is off.
 */

const CENTS = 100;
const PERCENT = 100;

export const CampaignRules = ({ campaignId }: { campaignId: string }) => {
  const t = useTranslations("Wizard.done.media.rules");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const rules = useQuery(
    orpc.campaigns.rules.queryOptions({ input: { campaignId } })
  );
  const save = useMutation(
    orpc.campaigns.setLossLimit.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.campaigns.rules.key(),
        });
      },
    })
  );
  const [draft, setDraft] = useState<string | null>(null);

  const { data } = rules;
  if (data === undefined || !data.on) {
    return null;
  }
  const { settings, targets } = data;
  const money = (cents: number) =>
    format.number(cents / CENTS, { currency: "USD", style: "currency" });
  const pct = (share: number) =>
    format.number(share * PERCENT, { maximumFractionDigits: 2 });
  const limit = draft ?? String(settings.lossLimitCents / CENTS);
  const limitCents = Math.round(Number(limit) * CENTS);
  const valid = Number.isFinite(limitCents) && limitCents >= 0;

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4 text-sm">
      <h3 className="font-medium">{t("title")}</h3>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t("pauseIf")}</p>
        <ul className="text-muted-foreground list-disc pl-5">
          {targets === undefined ? (
            <li>{t("noProfit")}</li>
          ) : (
            <>
              <li>
                {t("noSale", {
                  spend: money(
                    targets.targetCpaCents * settings.killNoSaleCpaMultiple
                  ),
                })}
              </li>
              <li>
                {t("cartNoSale", {
                  spend: money(
                    targets.targetCpaCents * settings.killCartNoSaleCpaMultiple
                  ),
                })}
              </li>
            </>
          )}
          <li>
            {t("lowCtr", {
              ctr: pct(settings.minCtr),
              impressions: format.number(settings.ctrMinImpressions),
            })}
          </li>
          <li>
            {t("highCpc", {
              clicks: settings.cpcMinClicks,
              cpc: money(settings.maxCpcCents),
            })}
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t("stopIf")}</p>
        <ul className="text-muted-foreground list-disc pl-5">
          <li>{t("dailyCap", { cap: money(data.dailySpendCapCents) })}</li>
          <li>{t("monthlyCap", { cap: money(data.monthlySpendCapCents) })}</li>
          <li>{t("lossLimit", { limit: money(settings.lossLimitCents) })}</li>
        </ul>
      </div>
      {targets === undefined ? null : (
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("scaleIf")}</p>
          <p className="text-muted-foreground">
            {t("scale", {
              hours: settings.scaleEveryHours,
              purchases: settings.scaleMinPurchases,
              roas: format.number(targets.scaleRoas, {
                maximumFractionDigits: 2,
              }),
              step: pct(settings.scaleStep),
            })}
          </p>
        </div>
      )}
      <p className="text-muted-foreground">{t("how")}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) {
            return;
          }
          save.mutate(
            { lossLimitCents: limitCents },
            { onSuccess: () => setDraft(null) }
          );
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={fieldId}>{t("limitLabel")}</Label>
          <Input
            className="h-9 w-32"
            id={fieldId}
            inputMode="decimal"
            min={0}
            onChange={(event) => setDraft(event.target.value)}
            step="1"
            type="number"
            value={limit}
          />
        </div>
        <Button
          className="h-9 px-4"
          disabled={!valid || save.isPending || draft === null}
          type="submit"
          variant="outline"
        >
          {t("save")}
        </Button>
      </form>
      {save.error === null ? null : (
        <p className="text-destructive" role="alert">
          {t("saveFailed", { reason: save.error.message })}
        </p>
      )}
    </section>
  );
};
