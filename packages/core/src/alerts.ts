import { z } from "zod";

import type { NotifyKind } from "./events";

// The merchant's alerts (openspec alerts): which channels each kind of alert
// goes to, and the quiet hours that hold the noisy channels. Pure, so the
// API, the web settings page and the tests share one definition.

// What the merchant chooses channels for. Each notify kind maps to one.
export const ALERT_TYPES = [
  // wovain paused an ad or a campaign, or stopped every campaign.
  "rule_action",
  // A rule asks to raise a budget.
  "scale_request",
  // Any other action waits for the merchant's approval.
  "approval",
  "first_sale",
  // A background job failed after its retries.
  "failure",
  // New suggestions and finished runs.
  "updates",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_CHANNELS = ["email", "push", "telegram"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

// Push and Telegram wake a phone, so quiet hours hold them; email is silent
// and goes at once.
export const QUIET_CHANNELS: readonly AlertChannel[] = ["push", "telegram"];

const KIND_TO_TYPE: Record<NotifyKind, AlertType> = {
  anomaly: "rule_action",
  approval: "approval",
  failure: "failure",
  first_sale: "first_sale",
  order: "first_sale",
  rule_action: "rule_action",
  run_done: "updates",
  run_failed: "failure",
  scale_request: "scale_request",
  suggestion: "updates",
};

export const alertTypeOf = (kind: NotifyKind): AlertType => KIND_TO_TYPE[kind];

// Money and failures reach every channel; updates only the phone.
export const DEFAULT_ALERT_CHANNELS: Record<AlertType, AlertChannel[]> = {
  approval: ["email", "push", "telegram"],
  failure: ["email", "push", "telegram"],
  first_sale: ["email", "push", "telegram"],
  rule_action: ["email", "push", "telegram"],
  scale_request: ["email", "push", "telegram"],
  updates: ["push"],
};

const HH_MM = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

const isTimeZone = (value: string) => {
  try {
    const format = new Intl.DateTimeFormat("en-US", { timeZone: value });
    return format.resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
};

export const quietHoursSchema = z.object({
  // Local times, HH:MM, in `timeZone`. End before start spans midnight.
  end: z.string().regex(HH_MM),
  start: z.string().regex(HH_MM),
  timeZone: z.string().refine(isTimeZone, "Unknown time zone"),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const alertSettingsSchema = z.object({
  channels: z.object(
    Object.fromEntries(
      ALERT_TYPES.map((type) => [
        type,
        z.array(z.enum(ALERT_CHANNELS)).max(ALERT_CHANNELS.length),
      ])
    ) as Record<AlertType, z.ZodArray<z.ZodEnum<{ [C in AlertChannel]: C }>>>
  ),
  quietHours: quietHoursSchema.nullable(),
});
export type AlertSettings = z.infer<typeof alertSettingsSchema>;

/**
 * The merchant's settings from what is stored: the defaults for any alert
 * type they never set, and no quiet hours. A stored value that no longer
 * parses (an old shape) falls back to the defaults rather than failing an
 * alert.
 */
export const alertSettingsOf = (stored: unknown): AlertSettings => {
  const raw =
    typeof stored === "object" && stored !== null
      ? (stored as Partial<Record<string, unknown>>)
      : {};
  const channels = { ...DEFAULT_ALERT_CHANNELS };
  const storedChannels = z
    .record(z.string(), z.array(z.enum(ALERT_CHANNELS)))
    .safeParse(raw["channels"]);
  if (storedChannels.success) {
    for (const type of ALERT_TYPES) {
      const picked = storedChannels.data[type];
      if (picked !== undefined) {
        channels[type] = [...new Set(picked)];
      }
    }
  }
  const quiet = quietHoursSchema.safeParse(raw["quietHours"]);
  return { channels, quietHours: quiet.success ? quiet.data : null };
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;

const minutesOf = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
};

// The wall-clock minute of the day at `now` in `timeZone`.
const localMinute = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(now);
  const part = (type: "hour" | "minute") =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part("hour") * MINUTES_PER_HOUR + part("minute");
};

/**
 * When the quiet hours around `now` end, or undefined outside them (or with
 * none set, or a start equal to the end). A clock change inside the quiet
 * hours moves the end by up to that hour.
 */
export const quietUntil = (
  now: Date,
  quiet: QuietHours | null
): Date | undefined => {
  if (quiet === null) {
    return undefined;
  }
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === end) {
    return undefined;
  }
  const minute = localMinute(now, quiet.timeZone);
  const inside =
    start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
  if (!inside) {
    return undefined;
  }
  const wait = (end - minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const startOfMinute =
    now.getTime() -
    now.getUTCSeconds() * MS_PER_SECOND -
    now.getUTCMilliseconds();
  return new Date(startOfMinute + wait * MS_PER_MINUTE);
};

export interface ChannelPlan {
  channel: AlertChannel;
  // Hold the channel until then (quiet hours).
  holdUntil?: Date | undefined;
}

/**
 * Where one alert goes and when: the channels the merchant picked for its
 * type, with push and Telegram held to the end of the quiet hours.
 */
export const planAlert = (
  kind: NotifyKind,
  settings: AlertSettings,
  now: Date
): ChannelPlan[] => {
  const until = quietUntil(now, settings.quietHours);
  return settings.channels[alertTypeOf(kind)].map((channel) => ({
    channel,
    holdUntil:
      until !== undefined && QUIET_CHANNELS.includes(channel)
        ? until
        : undefined,
  }));
};
