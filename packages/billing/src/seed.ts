// Creates or updates wovain's catalog in Polar from src/plans.ts: the credits
// meter, one meter-credit benefit and one product per plan and pack, and,
// when POLAR_WEBHOOK_URL is set, the webhook endpoint. It is idempotent: it
// finds what it made before by `wovain` metadata, so running it again only
// applies changes. Nothing is set up by hand in the dashboard.
//
//   pnpm polar:seed        (reads POLAR_* from apps/web's env through Varlock)
//
// Node runs this file directly, so it imports only the SDK and plans.ts.

import { appendFileSync } from "node:fs";

import { createPolarCore } from "@polar-sh/sdk/2026-10";
import type { Environment, PolarCore, models } from "@polar-sh/sdk/2026-10";
import {
  createBenefits,
  iterListBenefits,
  updateBenefits,
} from "@polar-sh/sdk/2026-10/services/benefits";
import {
  createMeters,
  iterListMeters,
} from "@polar-sh/sdk/2026-10/services/meters";
import {
  createProducts,
  iterListProducts,
  updateBenefitsProducts,
  updateProducts,
} from "@polar-sh/sdk/2026-10/services/products";
import {
  createWebhookEndpointWebhooks,
  iterListWebhookEndpointsWebhooks,
  updateWebhookEndpointWebhooks,
} from "@polar-sh/sdk/2026-10/services/webhooks";

import {
  CREDIT_METER,
  CREDIT_PACK,
  PLANS,
  PLAN_CODES,
  POLAR_METADATA_KEY,
  POLAR_WEBHOOK_EVENTS,
} from "./plans.ts";

interface Item {
  code: string;
  credits: number;
  description: string;
  name: string;
  priceCents: number;
  recurring: boolean;
  rollover: boolean;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;

const ITEMS: Item[] = [
  ...PLAN_CODES.map((code) => {
    const plan = PLANS[code];
    return {
      code,
      credits: plan.monthlyCredits,
      description: [
        `${plan.monthlyCredits} wovain credits every month`,
        plan.autopilot ? "autopilot included" : "you approve every step",
        plan.rollover ? "unused credits roll over" : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(", "),
      name: `wovain ${plan.name}`,
      priceCents: plan.priceCents,
      recurring: true,
      rollover: plan.rollover,
    };
  }),
  {
    code: CREDIT_PACK.code,
    credits: CREDIT_PACK.credits,
    description: `${CREDIT_PACK.credits} wovain credits that never expire`,
    name: `wovain ${CREDIT_PACK.name}`,
    priceCents: CREDIT_PACK.priceCents,
    recurring: false,
    rollover: true,
  },
];

const tagged = (code: string) => ({ [POLAR_METADATA_KEY]: code });

const first = async <T>(
  items: AsyncIterable<T>,
  match: (item: T) => boolean
): Promise<T | undefined> => {
  let found: T | undefined;
  for await (const item of items) {
    if (match(item)) {
      found = item;
      break;
    }
  }
  return found;
};

const hasTag = (metadata: Record<string, unknown>, code: string) =>
  metadata[POLAR_METADATA_KEY] === code;

const ensureMeter = async (polar: PolarCore) => {
  const found = await first(
    iterListMeters(polar)({ is_archived: false }),
    (meter) => hasTag(meter.metadata, "credits")
  );
  if (found !== undefined) {
    return found;
  }
  return await createMeters(polar)({
    aggregation: { func: "sum", property: CREDIT_METER.property },
    filter: {
      clauses: [
        { operator: "eq", property: "name", value: CREDIT_METER.event },
      ],
      conjunction: "and",
    },
    metadata: tagged("credits"),
    name: CREDIT_METER.name,
  });
};

const ensureBenefit = async (polar: PolarCore, meterId: string, item: Item) => {
  const properties = {
    meter_id: meterId,
    rollover: item.rollover,
    units: item.credits,
  };
  const description = `${item.credits} wovain credits`;
  const found = await first(
    iterListBenefits(polar)({ type: "meter_credit" }),
    (benefit) => hasTag(benefit.metadata, item.code)
  );
  if (found === undefined) {
    return await createBenefits(polar)({
      description,
      metadata: tagged(item.code),
      properties,
      type: "meter_credit",
    });
  }
  const current = found.type === "meter_credit" ? found.properties : undefined;
  if (
    current?.units === properties.units &&
    current.rollover === properties.rollover &&
    current.meter_id === properties.meter_id &&
    found.description === description
  ) {
    return found;
  }
  return await updateBenefits(polar)(found.id, {
    description,
    properties,
    type: "meter_credit",
  });
};

const fixedPrice = (product: models.Product) =>
  product.prices.find(
    (price) => !price.is_archived && price.amount_type === "fixed"
  );

const pricesFor = (item: Item): models.ProductPriceFixedCreate[] =>
  item.priceCents === 0
    ? []
    : [
        {
          amount_type: "fixed",
          price_amount: item.priceCents,
          price_currency: "usd",
        },
      ];

const ensureProduct = async (polar: PolarCore, item: Item) => {
  const found = await first(
    iterListProducts(polar)({ is_archived: false }),
    (product) => hasTag(product.metadata, item.code)
  );
  if (found === undefined) {
    const shared = {
      description: item.description,
      metadata: tagged(item.code),
      name: item.name,
      prices: pricesFor(item),
    };
    return await createProducts(polar)(
      item.recurring ? { ...shared, recurring_interval: "month" } : shared
    );
  }
  const price = fixedPrice(found);
  const priceCents =
    price !== undefined && "price_amount" in price ? price.price_amount : 0;
  if (
    found.name === item.name &&
    found.description === item.description &&
    priceCents === item.priceCents
  ) {
    return found;
  }
  // A changed price is a new price on the product; current subscribers keep
  // theirs until they change plan (Polar's rule).
  return await updateProducts(polar)(found.id, {
    description: item.description,
    name: item.name,
    ...(priceCents === item.priceCents ? {} : { prices: pricesFor(item) }),
  });
};

const ensureWebhook = async (polar: PolarCore, url: string, out: string) => {
  const events = [...POLAR_WEBHOOK_EVENTS];
  const found = await first(
    iterListWebhookEndpointsWebhooks(polar)(),
    (endpoint) => endpoint.url === url
  );
  if (found !== undefined) {
    await updateWebhookEndpointWebhooks(polar)(found.id, { events });
    return `updated ${found.id}`;
  }
  const created = await createWebhookEndpointWebhooks(polar)({
    api_version: "2026-10",
    events,
    format: "raw",
    name: "wovain",
    url,
  });
  // The signing secret is shown once: it goes to a gitignored env file, never
  // to the console.
  appendFileSync(out, `POLAR_WEBHOOK_SECRET=${created.secret}\n`);
  return `created ${created.id}; its secret is in ${out}`;
};

const main = async () => {
  const accessToken = process.env["POLAR_ACCESS_TOKEN"];
  if (accessToken === undefined || accessToken === "") {
    throw new Error("POLAR_ACCESS_TOKEN is not set (apps/web/.env.local)");
  }
  const environment: Environment =
    process.env["POLAR_ENVIRONMENT"] === "production"
      ? "production"
      : "sandbox";
  const polar = createPolarCore({ accessToken, environment });
  const meter = await ensureMeter(polar);
  console.info(`polar:${environment} meter ${meter.name} ${meter.id}`);
  for (const item of ITEMS) {
    // In order: each product links the benefit made just before it.
    // oxlint-disable-next-line no-await-in-loop
    const benefit = await ensureBenefit(polar, meter.id, item);
    // oxlint-disable-next-line no-await-in-loop
    const product = await ensureProduct(polar, item);
    // oxlint-disable-next-line no-await-in-loop
    await updateBenefitsProducts(polar)(product.id, { benefits: [benefit.id] });
    console.info(
      `polar:${environment} ${item.code} ${dollars(item.priceCents)} product ${product.id} benefit ${benefit.id}`
    );
  }
  const webhookUrl = process.env["POLAR_WEBHOOK_URL"];
  if (webhookUrl !== undefined && webhookUrl !== "") {
    const outcome = await ensureWebhook(
      polar,
      webhookUrl,
      process.env["POLAR_WEBHOOK_SECRET_OUT"] ?? ".env.polar-webhook"
    );
    console.info(`polar:${environment} webhook ${webhookUrl} ${outcome}`);
  }
};

await main();
