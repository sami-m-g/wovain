import { randomInt } from "node:crypto";

import type { Dataset } from "./meta-graph";

// Which Meta dataset (pixel) the shop measures sales with (openspec
// pixel-automation), when wovain sets it up with the merchant's Meta grant.

// What wovain names a dataset it creates, before the shop's name.
export const DATASET_PREFIX = "wovain";
const MAX_NAME = 50;

export const datasetNameFor = (shopName?: string) =>
  (shopName === undefined || shopName.trim() === ""
    ? DATASET_PREFIX
    : `${DATASET_PREFIX} - ${shopName.trim()}`
  ).slice(0, MAX_NAME);

/**
 * The dataset to use among those the ad account can use: the only one; else
 * one wovain created; else the one that received an event last; else the
 * first. Undefined when there is none, so wovain creates one.
 */
export const chooseDataset = (datasets: readonly Dataset[]) => {
  if (datasets.length <= 1) {
    return datasets[0];
  }
  const ours = datasets.find((each) =>
    each.name?.toLowerCase().startsWith(DATASET_PREFIX)
  );
  if (ours !== undefined) {
    return ours;
  }
  const fired = datasets
    .filter((each) => each.lastFiredAt !== null)
    .toSorted((a, b) =>
      (b.lastFiredAt ?? "").localeCompare(a.lastFiredAt ?? "")
    );
  return fired[0] ?? datasets[0];
};

const CODE_MIN = 10_000;
const CODE_MAX = 100_000;

// A Conversions API test event code, as Events Manager shows them
// (TEST followed by digits).
export const newTestEventCode = () => `TEST${randomInt(CODE_MIN, CODE_MAX)}`;
