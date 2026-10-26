import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { ENV } from "./env.ts";

// Demo traffic for the self-healing flow (docs/flows.md): calls the checkout
// quote endpoint so that, with the fault-injection-checkout flag on, errors
// reach Cloud Logging. Usage:
//   pnpm --filter @wovain/ops traffic [--url https://wovain.com] [--requests 20]

const { values } = parseArgs({
  options: {
    "delay-ms": { default: "250", type: "string" },
    requests: { default: "20", type: "string" },
    url: { type: "string" },
  },
});
// Production by default; --url or SITE_URL points it elsewhere.
const site = values.url ?? ENV.SITE_URL;
const endpoint = new URL("/api/checkout/quote", site);
const total = Number(values.requests);
const delay = Number(values["delay-ms"]);

const statuses = new Map<number, number>();
for (let i = 0; i < total; i += 1) {
  // oxlint-disable-next-line eslint/no-await-in-loop -- paced on purpose
  const response = await fetch(endpoint);
  statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
  // oxlint-disable-next-line eslint/no-await-in-loop -- paced on purpose
  await sleep(delay);
}
console.log(
  `${total} requests to ${endpoint.toString()}:`,
  Object.fromEntries(statuses)
);
