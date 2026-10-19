import type { Settings } from "@wovain/shared/settings";
import {
  LIST_PRICES_AS_OF,
  clipCost,
  videoModelIds,
  videoModels,
} from "@wovain/shared/video-models";
import type { VideoModelId, VideoPrices } from "@wovain/shared/video-models";

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
  options: { label: string; value: string }[];
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

const money = (value: number) => `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;

const audioCost: Record<Settings["audio"]["source"], number> = {
  "kling-native": 0.63,
  mmaudio: 0.015,
  off: 0,
};

// One option per fal model, priced for a 15 s clip from live fal prices
// (or the recorded list prices when the server has no FAL_KEY).
const videoOptions = (prices: VideoPrices) =>
  videoModelIds.map((id) => ({
    label: `${videoModels[id].shortLabel} · ${money(clipCost(id, 15, prices))}`,
    value: id,
  }));

const priceNote = (prices: VideoPrices, model: VideoModelId) =>
  prices[model].source === "fal" ? "" : ` (list price, ${LIST_PRICES_AS_OF})`;
const audioLabel: Record<Settings["audio"]["source"], string> = {
  "kling-native": "Kling native",
  mmaudio: "MMAudio background",
  off: "Off",
};

export const mainSections = (prices: VideoPrices): Section[] => [
  {
    fields: [
      {
        key: "model",
        kind: "choice",
        label: "Model",
        options: videoOptions(prices),
      },
      {
        key: "resolution",
        kind: "choice",
        label: "Resolution",
        options: [
          { label: "720p", value: "720p" },
          { label: "1080p", value: "1080p" },
        ],
      },
      {
        key: "seconds",
        kind: "number",
        label: "Length",
        max: 15,
        min: 5,
        unit: "s",
      },
      {
        key: "clipsPerProduct",
        kind: "number",
        label: "Clips per product",
        max: 4,
        min: 1,
      },
      {
        key: "elements",
        kind: "toggle",
        label: "Keep the print (elements, Kling only)",
      },
    ],
    group: "video",
    id: "video",
    summary: (s) =>
      `${videoModels[s.video.model].label} ${s.video.resolution} · ${money(clipCost(s.video.model, s.video.seconds, prices))} per clip${priceNote(prices, s.video.model)}${videoModels[s.video.model].keepsPrint ? "" : " · test only"}`,
    title: "Video model",
  },
  {
    fields: [
      {
        key: "source",
        kind: "choice",
        label: "Source",
        options: [
          { label: "MMAudio · $0.015", value: "mmaudio" },
          { label: "Kling · $0.63", value: "kling-native" },
          { label: "Off", value: "off" },
        ],
      },
      { key: "prompt", kind: "text", label: "Music prompt" },
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
        min: 0,
        step: 1,
      },
      {
        key: "minMarginPct",
        kind: "percent",
        label: "Minimum margin",
        max: 95,
        min: 0,
      },
      {
        key: "roundToCleanPrice",
        kind: "toggle",
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
        max: 500,
        min: 1,
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
        min: 1,
        step: 0.5,
      },
      {
        key: "killDesignMultiple",
        kind: "multiple",
        label: "Pause a design with no sales at",
        min: 1,
        step: 0.5,
      },
      {
        key: "killExpensiveMultiple",
        kind: "multiple",
        label: "Pause an ad costing more than",
        min: 1,
        step: 0.1,
      },
      {
        key: "killExpensiveMinSales",
        kind: "number",
        label: "…once it has sales",
        min: 1,
      },
      {
        key: "killCheckMinutes",
        kind: "number",
        label: "Check every",
        min: 30,
        unit: "min",
      },
      {
        key: "scaleUnderMultiple",
        kind: "multiple",
        label: "Scale when cost per sale is under",
        max: 1,
        min: 0,
        step: 0.1,
      },
      {
        key: "scaleMinSales",
        kind: "number",
        label: "…with at least",
        min: 1,
        unit: "sales",
      },
      {
        key: "scaleStepPct",
        kind: "percent",
        label: "Raise the budget by",
        min: 1,
      },
      {
        key: "scaleEveryHours",
        kind: "number",
        label: "At most every",
        min: 24,
        unit: "h",
      },
      {
        key: "scaleCapMultiple",
        kind: "number",
        label: "Cap the budget at",
        max: 5,
        min: 1,
        step: 0.5,
        unit: "× starting",
      },
      {
        key: "alertAboveBreakeven",
        kind: "toggle",
        label: "Alert when cost per sale passes breakeven",
      },
      {
        key: "tagUtmContent",
        kind: "toggle",
        label: "Tag ad links with utm_content = ad ID",
      },
    ],
    group: "rules",
    id: "rules",
    summary: (s) =>
      `Pause at ${s.rules.killNoSalesMultiple}× breakeven · scale +${s.rules.scaleStepPct}% / ${s.rules.scaleEveryHours} h`,
    title: "Rules",
  },
];

export const moreSections: Section[] = [
  {
    fields: [
      {
        key: "ideas",
        kind: "number",
        label: "Ideas per trend card",
        max: 10,
        min: 1,
      },
      { key: "pickMin", kind: "number", label: "Pick at least", min: 1 },
      { key: "pickMax", kind: "number", label: "Pick at most", min: 1 },
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
        min: 0,
        step: 0.1,
      },
      {
        key: "cardFeeFixed",
        kind: "money",
        label: "Card fee per order",
        min: 0,
        step: 0.05,
      },
      {
        key: "shipping",
        kind: "money",
        label: "Shipping (if no live rate)",
        min: 0,
        step: 0.5,
      },
      {
        key: "salesTaxPct",
        kind: "percent",
        label: "Sales tax",
        min: 0,
        step: 0.5,
      },
      {
        key: "refundReservePct",
        kind: "percent",
        label: "Refund reserve",
        min: 0,
        step: 0.5,
      },
      {
        key: "breakevenBasis",
        kind: "choice",
        label: "Breakeven based on",
        options: [
          { label: "Priciest size", value: "priciest-size" },
          { label: "Size-weighted", value: "size-weighted" },
        ],
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
      { key: "captions", kind: "toggle", label: "Burn in captions" },
      {
        key: "brandSeconds",
        kind: "number",
        label: "Show the brand for",
        max: 15,
        min: 0,
        unit: "s",
      },
    ],
    group: "overlay",
    id: "overlay",
    summary: (s) =>
      `${s.overlay.captions ? "Captions on" : "Captions off"} · brand ${s.overlay.brandSeconds} s`,
    title: "Video overlay",
  },
  {
    fields: [
      { key: "aiDisclosure", kind: "toggle", label: "Label ads as AI-made" },
      { key: "graphApiVersion", kind: "text", label: "Graph API version" },
    ],
    group: "meta",
    id: "meta",
    summary: (s) =>
      `${s.meta.aiDisclosure ? "AI label on" : "AI label off"} · ${s.meta.graphApiVersion}`,
    title: "Meta",
  },
];
