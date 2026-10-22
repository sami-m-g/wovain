import { replyRoots } from "./reply-json.ts";
import type { Reply } from "./reply-json.ts";

// Rows of an analytics reply. Fourthwall's report tools and Meta's
// ads_get_ad_entities document their columns but not the envelope around
// them, so this takes the first list of row objects at any depth (or a
// `columns` plus `rows` table) and reads columns by name, ignoring case, `_`
// and `-`. Everything here is untrusted data from the merchant's accounts.

export type Row = Record<string, unknown>;

const MAX_ROWS = 1000;
// A bound on any one cell's text; callers cut to what they display.
const MAX_TEXT = 500;

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// A { columns: ["date", …], rows: [["2026-10-01", …]] } table as row objects.
const table = (node: Row): Row[] | undefined => {
  const { columns, rows } = node;
  if (
    !(Array.isArray(columns) && Array.isArray(rows)) ||
    !rows.every(Array.isArray)
  ) {
    return undefined;
  }
  const names = columns.map((column) =>
    typeof column === "string" ? column : ""
  );
  return rows.map((cells: unknown[]) =>
    Object.fromEntries(names.map((name, index) => [name, cells[index]]))
  );
};

const firstRows = (node: unknown, depth: number): Row[] | undefined => {
  if (depth > 4) {
    return undefined;
  }
  if (Array.isArray(node)) {
    if (node.length > 0 && node.every(isRow)) {
      return node;
    }
    return undefined;
  }
  if (!isRow(node)) {
    return undefined;
  }
  const zipped = table(node);
  if (zipped !== undefined) {
    return zipped;
  }
  for (const child of Object.values(node)) {
    const found = firstRows(child, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};

export const reportRows = (reply: Reply): Row[] => {
  for (const root of replyRoots(reply)) {
    const rows = firstRows(root, 0);
    if (rows !== undefined) {
      return rows.slice(0, MAX_ROWS);
    }
  }
  return [];
};

const key = (name: string) => name.toLowerCase().replaceAll(/[_-]/gu, "");

const cell = (row: Row, names: string[]): unknown => {
  const wanted = new Set(names.map(key));
  return Object.entries(row).find(([name]) => wanted.has(key(name)))?.[1];
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(/[$,\s]/gu, ""));
    return value.trim() === "" || !Number.isFinite(parsed) ? undefined : parsed;
  }
  // A money object: { amount: 12.5, currency: "USD" } or { value: … }.
  return isRow(value) ? toNumber(value["amount"] ?? value["value"]) : undefined;
};

// The first of `names` the row has, as a number (0 when absent or unreadable).
export const num = (row: Row, ...names: string[]) =>
  toNumber(cell(row, names)) ?? 0;

// The first of `names` as display text: control characters removed, trimmed
// and bounded. Undefined when empty.
const clean = (value: string) =>
  value
    .replaceAll(/\p{Cc}/gu, " ")
    .trim()
    .slice(0, MAX_TEXT);

export const str = (row: Row, ...names: string[]) => {
  const value = cell(row, names);
  const text =
    typeof value === "string" || typeof value === "number"
      ? clean(String(value))
      : "";
  return text === "" ? undefined : text;
};
