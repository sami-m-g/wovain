// Formatting and parsing the app's screens share. No React Native imports,
// so the unit tests run in Node.

const usd = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const usdCents = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

const whole = new Intl.NumberFormat("en-US");

export const dollars = (value: number) => usd.format(value);

// Money in the approval queue is integer US cents.
export const cents = (value: number) => usdCents.format(value / 100);

export const count = (value: number) => whole.format(value);

export const percent = (value?: number) =>
  value === undefined ? "–" : `${value.toFixed(1)}%`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "just now", "5m ago", "3h ago", "2d ago".
export const ago = (date: Date | string, now = Date.now()) => {
  const elapsed = now - new Date(date).getTime();
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`;
  }
  return `${Math.floor(elapsed / DAY)}d ago`;
};

// The tabs a push notification may open (packages/api flow/push.ts SCREEN).
const NOTIFICATION_ROUTES = ["/", "/approvals", "/review", "/kpis"] as const;
type NotificationRoute = (typeof NOTIFICATION_ROUTES)[number];

// The tab a tapped notification opens: its `url` when it's one of ours,
// else the inbox. The payload comes from the server but passes through the
// OS, so it's checked rather than trusted.
export const routeOf = (data: unknown): NotificationRoute => {
  const url =
    typeof data === "object" && data !== null && "url" in data
      ? data.url
      : undefined;
  return NOTIFICATION_ROUTES.find((route) => route === url) ?? "/";
};

// An oRPC error's HTTP status: the server answers 404 while a feature's flag
// is off for the merchant.
export const isUnavailable = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 404;
