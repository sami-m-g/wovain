import { money } from "@wovain/shared/economics";

// A dash where a ratio has no denominator (no spend, no purchases).
export const ratioText = (value: number | undefined) =>
  value === undefined ? "–" : `${value.toFixed(1)}×`;

export const moneyText = (value: number | undefined) =>
  value === undefined ? "–" : money(value);

// Provider names as merchants know them.
export const titles = { fal: "fal", fourthwall: "Fourthwall", meta: "Meta" };
