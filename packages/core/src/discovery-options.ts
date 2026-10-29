// The questionnaire's choices for guided brand discovery (./brand-discovery).
// Pure data with no imports, so the app can import it in the browser.

export const FEELINGS = [
  "cosy",
  "proud",
  "funny",
  "rebellious",
  "calm",
  "dreamy",
] as const;
export type Feeling = (typeof FEELINGS)[number];

export const GOALS = [
  "side_income",
  "build_brand",
  "test_fast",
  "existing_audience",
] as const;
export type Goal = (typeof GOALS)[number];

export const INVOLVEMENT = ["hands_off", "some", "hands_on"] as const;
export type Involvement = (typeof INVOLVEMENT)[number];

// Qloo's age buckets, youngest first.
export const AGE_BANDS = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
  "55_and_older",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

// What a starter brand can print on: Fourthwall blank kinds.
export const PRODUCT_KINDS = [
  "t-shirt",
  "hoodie",
  "crewneck",
  "tote bag",
  "mug",
  "sticker",
  "poster",
  "cap",
] as const;
