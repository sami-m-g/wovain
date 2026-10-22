import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { pricingSettings } from "@wovain/shared/settings";
import { useId, useState } from "react";
import type { z } from "zod";

import { useAction } from "../lib/use-action.ts";
import { ActionError } from "../lib/widget-shell.tsx";

// Only the two bounds the quick settings edit; the schema is the server's.
const pricingValues = pricingSettings.pick({
  minMarginPct: true,
  minProfit: true,
});

export type PricingValues = z.infer<typeof pricingValues>;

// The widget's ⚙ quick settings: the values this widget's price depends on.
// Saving updates wovain's settings, so later widgets use them too.
export const PricingSettings = ({
  onSave,
  values,
}: {
  onSave: (values: PricingValues) => Promise<void>;
  values: PricingValues;
}) => {
  const id = useId();
  const [minProfit, setMinProfit] = useState(String(values.minProfit));
  const [minMarginPct, setMinMarginPct] = useState(String(values.minMarginPct));
  const { failed, pending, run } = useAction<"save">();
  // Number("") is 0, which the schema accepts, so empty fields don't parse.
  const parsed =
    minProfit === "" || minMarginPct === ""
      ? undefined
      : pricingValues.safeParse({
          minMarginPct: Number(minMarginPct),
          minProfit: Number(minProfit),
        });

  const save = async () => {
    if (parsed?.success === true) {
      await run("save", async () => {
        await onSave(parsed.data);
      });
    }
  };

  return (
    <form
      className="bg-surface-secondary grid gap-3 rounded-xl p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-secondary text-sm" htmlFor={`${id}-profit`}>
          Minimum profit
        </label>
        <Input
          id={`${id}-profit`}
          inputMode="decimal"
          min={0}
          onChange={(event) => {
            setMinProfit(event.target.value);
          }}
          startAdornment="$"
          type="number"
          value={minProfit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-secondary text-sm" htmlFor={`${id}-margin`}>
          Minimum margin
        </label>
        <Input
          endAdornment="%"
          id={`${id}-margin`}
          inputMode="decimal"
          max={95}
          min={0}
          onChange={(event) => {
            setMinMarginPct(event.target.value);
          }}
          type="number"
          value={minMarginPct}
        />
      </div>
      <Button
        color="secondary"
        disabled={parsed?.success !== true || pending}
        loading={pending}
        type="submit"
        variant="soft"
      >
        Reprice
      </Button>
      <ActionError failed={failed} />
    </form>
  );
};
