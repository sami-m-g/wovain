import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { useId, useState } from "react";

export interface PricingValues {
  minMarginPct: number;
  minProfit: number;
}

// The card's ⚙ quick settings: the values this card's price depends on.
// Saving updates wovain's settings, so later cards use them too.
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
  const [saving, setSaving] = useState(false);
  const profit = Number(minProfit);
  const margin = Number(minMarginPct);
  const valid =
    minProfit !== "" &&
    minMarginPct !== "" &&
    profit >= 0 &&
    margin >= 0 &&
    margin <= 95;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ minMarginPct: margin, minProfit: profit });
    } catch {
      // The card keeps the form open so the merchant can try again.
    }
    setSaving(false);
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
        disabled={!valid || saving}
        loading={saving}
        type="submit"
        variant="soft"
      >
        Reprice
      </Button>
    </form>
  );
};
