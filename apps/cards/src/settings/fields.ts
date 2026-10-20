import { settingsSchema } from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";
import {
  LIST_PRICES_AS_OF,
  clipCost,
  clipSeconds,
  videoModelIds,
  videoModels,
} from "@wovain/shared/video-models";
import type { VideoModelId, VideoPrices } from "@wovain/shared/video-models";
import { z } from "zod";

// What the card shows for each setting. Groups and keys mirror packages/shared.
type Group = keyof Settings;

interface NumberField {
  kind: "money" | "percent" | "number" | "multiple";
  max?: number;
  min?: number;
  step?: number;
  unit?: string;
}
interface ChoiceField {
  kind: "choice";
  // More than 3 options render as a list, where each option can carry a hint.
  options: { hint?: string; label: string; value: string }[];
}
interface ToggleField {
  kind: "toggle";
}
interface TextField {
  kind: "text";
}

export type FieldSpec = { key: string; label: string } & (
  | NumberField
  | ChoiceField
  | ToggleField
  | TextField
);

export interface Section {
  fields: FieldSpec[];
  group: Group;
  id: string;
  summary: (settings: Settings) => string;
  title: string;
}

// What a section lists by hand: the words a person reads. The field's type,
// bounds and choices come from settingsSchema, so they can't drift from what
// saves. `options` is either labels for an enum's values or a full list.
interface FieldInput {
  key: string;
  kind?: "money" | "percent" | "multiple";
  label: string;
  options?: Record<string, string> | ChoiceField["options"];
  step?: number;
  unit?: string;
}
type SectionInput = Omit<Section, "fields"> & { fields: FieldInput[] };

// zod reports a missing bound as ±MAX_SAFE_INTEGER (ints) or ±Infinity.
const bound = (value: number | null) =>
  value !== null && Math.abs(value) < Number.MAX_SAFE_INTEGER
    ? value
    : undefined;

const field = (group: Group, input: FieldInput): FieldSpec => {
  const shape: Record<string, z.ZodType> =
    settingsSchema.shape[group].unwrap().shape;
  const schema = shape[input.key];
  if (schema === undefined) {
    throw new Error(`No setting ${group}.${input.key}`);
  }
  const inner = schema instanceof z.ZodDefault ? schema.unwrap() : schema;
  const { key, label } = input;
  if (inner instanceof z.ZodBoolean) {
    return { key, kind: "toggle", label };
  }
  if (inner instanceof z.ZodEnum) {
    const labels = input.options;
    return {
      key,
      kind: "choice",
      label,
      options: Array.isArray(labels)
        ? labels
        : inner.options.map((option) => ({
            label: labels?.[String(option)] ?? String(option),
            value: String(option),
          })),
    };
  }
  if (!(inner instanceof z.ZodNumber)) {
    return { key, kind: "text", label };
  }
  const spec: FieldSpec & NumberField = {
    key,
    kind: input.kind ?? "number",
    label,
  };
  const min = bound(inner.minValue);
  const max = bound(inner.maxValue);
  if (min !== undefined) {
    spec.min = min;
  }
  if (max !== undefined) {
    spec.max = max;
  }
  if (input.step !== undefined) {
    spec.step = input.step;
  }
  if (input.unit !== undefined) {
    spec.unit = input.unit;
  }
  return spec;
};

const sections = (inputs: SectionInput[]): Section[] =>
  inputs.map((input) => ({
    ...input,
    fields: input.fields.map((item) => field(input.group, item)),
  }));

const money = (value: number) => `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;

const audioCost: Record<Settings["audio"]["source"], number> = {
  "kling-native": 0.63,
  mmaudio: 0.015,
  off: 0,
};

// One option per fal model, priced for a 15 s clip from live fal prices
// (or the recorded list prices when the server has no FAL_KEY).
const videoOptions = (prices: VideoPrices) =>
  videoModelIds.map((id) => {
    const model = videoModels[id];
    const seconds = Math.min(15, model.maxSeconds);
    return {
      hint: `${money(clipCost(id, 15, prices))} per ${seconds} s clip · ${model.keepsPrint ? "keeps the print" : "test only, print can drift"}`,
      label: model.label,
      value: id,
    };
  });

// fal's price list leaves out resolution, audio and provider rules, so the
// card says it's a list price and that the real charge can be higher.
const priceNote = (prices: VideoPrices, model: VideoModelId) =>
  prices[model].source === "fal"
    ? " (list price, actual may be higher)"
    : ` (list price, ${LIST_PRICES_AS_OF}; actual may be higher)`;
const audioLabel: Record<Settings["audio"]["source"], string> = {
  "kling-native": "Kling native",
  mmaudio: "MMAudio background",
  off: "Off",
};

export const mainSections = (prices: VideoPrices): Section[] =>
  sections([
    {
      fields: [
        {
          key: "model",
          label: "Model",
          options: videoOptions(prices),
        },
        {
          key: "resolution",
          label: "Resolution",
          options: {
            "1080p": "1080p",
            "720p": "720p",
          },
        },
        {
          key: "seconds",
          label: "Length",
          unit: "s",
        },
        {
          key: "clipsPerProduct",
          label: "Clips per product",
        },
        {
          key: "elements",
          label: "Keep the print (elements, Kling only)",
        },
      ],
      group: "video",
      id: "video",
      summary: (s) =>
        `${videoModels[s.video.model].label} ${s.video.resolution} · ${money(clipCost(s.video.model, s.video.seconds, prices))} per clip${priceNote(prices, s.video.model)}${clipSeconds(s.video.model, s.video.seconds) < s.video.seconds ? ` · ${videoModels[s.video.model].maxSeconds} s max` : ""}${videoModels[s.video.model].keepsPrint ? "" : " · test only"}`,
      title: "Video model",
    },
    {
      fields: [
        {
          key: "source",
          label: "Source",
          options: {
            "kling-native": "Kling · $0.63",
            mmaudio: "MMAudio · $0.015",
            off: "Off",
          },
        },
        { key: "prompt", label: "Music prompt" },
      ],
      group: "audio",
      id: "audio",
      summary: (s) =>
        s.audio.source === "off"
          ? "Off"
          : `${audioLabel[s.audio.source]} · $${audioCost[s.audio.source]} per clip`,
      title: "Audio",
    },
    {
      fields: [
        {
          key: "minProfit",
          kind: "money",
          label: "Minimum profit",
          step: 1,
        },
        {
          key: "minMarginPct",
          kind: "percent",
          label: "Minimum margin",
        },
        {
          key: "roundToCleanPrice",
          label: "Round up to a clean price",
        },
      ],
      group: "pricing",
      id: "pricing",
      summary: (s) =>
        `≥ ${money(s.pricing.minProfit)} profit or ${s.pricing.minMarginPct}% margin`,
      title: "Pricing",
    },
    {
      fields: [
        {
          key: "dailyBudgetPerProduct",
          kind: "money",
          label: "Daily budget per product",
          step: 1,
        },
      ],
      group: "campaign",
      id: "budget",
      summary: (s) =>
        `${money(s.campaign.dailyBudgetPerProduct)} per product per day`,
      title: "Budget",
    },
    {
      fields: [
        {
          key: "killNoSalesMultiple",
          kind: "multiple",
          label: "Pause an ad with no sales at",
          step: 0.5,
        },
        {
          key: "killDesignMultiple",
          kind: "multiple",
          label: "Pause a design with no sales at",
          step: 0.5,
        },
        {
          key: "killExpensiveMultiple",
          kind: "multiple",
          label: "Pause an ad costing more than",
          step: 0.1,
        },
        {
          key: "killExpensiveMinSales",
          label: "…once it has sales",
        },
        {
          key: "killCheckMinutes",
          label: "Check every",
          unit: "min",
        },
        {
          key: "scaleUnderMultiple",
          kind: "multiple",
          label: "Scale when cost per sale is under",
          step: 0.1,
        },
        {
          key: "scaleMinSales",
          label: "…with at least",
          unit: "sales",
        },
        {
          key: "scaleStepPct",
          kind: "percent",
          label: "Raise the budget by",
        },
        {
          key: "scaleEveryHours",
          label: "At most every",
          unit: "h",
        },
        {
          key: "scaleCapMultiple",
          label: "Cap the budget at",
          step: 0.5,
          unit: "× starting",
        },
        {
          key: "alertAboveBreakeven",
          label: "Alert when cost per sale passes breakeven",
        },
        {
          key: "tagUtmContent",
          label: "Tag ad links with utm_content = ad ID",
        },
      ],
      group: "rules",
      id: "rules",
      summary: (s) =>
        `Pause at ${s.rules.killNoSalesMultiple}× breakeven · scale +${s.rules.scaleStepPct}% / ${s.rules.scaleEveryHours} h`,
      title: "Rules",
    },
  ]);

export const moreSections: Section[] = sections([
  {
    fields: [
      {
        key: "ideas",
        label: "Ideas per trend card",
      },
      { key: "pickMin", label: "Pick at least" },
      { key: "pickMax", label: "Pick at most" },
    ],
    group: "trends",
    id: "trends",
    summary: (s) =>
      `${s.trends.ideas} ideas · pick ${s.trends.pickMin} to ${s.trends.pickMax}`,
    title: "Trends",
  },
  {
    fields: [
      {
        key: "cardFeePct",
        kind: "percent",
        label: "Card fee",
        step: 0.1,
      },
      {
        key: "cardFeeFixed",
        kind: "money",
        label: "Card fee per order",
        step: 0.05,
      },
      {
        key: "shipping",
        kind: "money",
        label: "Shipping (if no live rate)",
        step: 0.5,
      },
      {
        key: "salesTaxPct",
        kind: "percent",
        label: "Sales tax",
        step: 0.5,
      },
      {
        key: "refundReservePct",
        kind: "percent",
        label: "Refund reserve",
        step: 0.5,
      },
      {
        key: "breakevenBasis",
        label: "Breakeven based on",
        options: {
          "priciest-size": "Priciest size",
          "size-weighted": "Size-weighted",
        },
      },
    ],
    group: "economics",
    id: "economics",
    summary: (s) =>
      `Fees ${s.economics.cardFeePct}% + ${money(s.economics.cardFeeFixed)} · reserve ${s.economics.refundReservePct}%`,
    title: "Economics",
  },
  {
    fields: [
      { key: "aiDisclosure", label: "Label ads as AI-made" },
      { key: "graphApiVersion", label: "Graph API version" },
    ],
    group: "meta",
    id: "meta",
    summary: (s) =>
      `${s.meta.aiDisclosure ? "AI label on" : "AI label off"} · ${s.meta.graphApiVersion}`,
    title: "Meta",
  },
]);
