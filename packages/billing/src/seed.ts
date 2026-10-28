// Creates or updates wovain's catalog in Polar from src/plans.ts and
// src/promos.ts: the credits meter, one meter-credit benefit and one product
// per plan, pack and promo, each promo's 100%-off discount code, and, when
// POLAR_WEBHOOK_URL is set, the webhook endpoint. It is idempotent: it finds
// what it made before by `wovain` metadata, so running it again only applies
// changes. Nothing is set up by hand in the dashboard.
//
//   pnpm polar:seed        (reads POLAR_* from apps/web's env through Varlock)
//   POLAR_PAID_PLANS=on pnpm polar:seed   (unarchives the paid plans and pack)
//
// A promo's code is random (or POLAR_PROMO_CODE_<ID>, e.g.
// POLAR_PROMO_CODE_JUDGES_2026, when set) and is never printed: it goes to
// Secret Manager as polar-promo-<id> in CI, else to .env.polar-promos.
//
// Node runs this file directly, so it imports only the SDK, plans.ts and
// promos.ts.

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { createPolarCore } from "@polar-sh/sdk/2026-10";
import type { Environment, PolarCore, models } from "@polar-sh/sdk/2026-10";
import {
  createBenefits,
  iterListBenefits,
  updateBenefits,
} from "@polar-sh/sdk/2026-10/services/benefits";
import {
  createDiscounts,
  deleteDiscounts,
  iterListDiscounts,
  updateDiscounts,
} from "@polar-sh/sdk/2026-10/services/discounts";
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
  resetWebhookEndpointSecretWebhooks,
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
import { PROMOS, promoPriceCents, promoSecretId, promoTag } from "./promos.ts";
import type { Promo } from "./promos.ts";

interface Item {
  // Set for a promo's product: archived exactly when the promo is off,
  // whatever the paid-plans switch says.
  archived?: boolean;
  code: string;
  credits: number;
  description: string;
  name: string;
  priceCents: number;
  recurring: boolean;
  rollover: boolean;
  // Promo products stay off Polar's storefront: only a code's checkout
  // sells them.
  visibility?: "private";
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

const PROMO_ITEMS: Item[] = PROMOS.map((promo) => ({
  archived: !promo.enabled,
  code: promoTag(promo.id),
  credits: promo.credits,
  description: `${promo.credits} wovain credits from a promo code. They never expire.`,
  name: `wovain ${promo.name} promo`,
  priceCents: promoPriceCents(promo),
  recurring: false,
  rollover: true,
  visibility: "private",
}));

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

// Polar needs at least one price; a fixed price of 0 is its free price.
const pricesFor = (item: Item): models.ProductPriceFixedCreate[] => [
  {
    amount_type: "fixed",
    price_amount: item.priceCents,
    price_currency: "usd",
  },
];

// Archived products stay found, so a run never makes a second copy.
const findProduct = async (polar: PolarCore, code: string) =>
  (await first(iterListProducts(polar)({ is_archived: false }), (product) =>
    hasTag(product.metadata, code)
  )) ??
  (await first(iterListProducts(polar)({ is_archived: true }), (product) =>
    hasTag(product.metadata, code)
  ));

// Paid plans and the pack exist but stay archived (nobody can buy them)
// until POLAR_PAID_PLANS=on; Free is always live, and a promo's product is
// live while the promo is on.
const ensureProduct = async (polar: PolarCore, item: Item, paid: boolean) => {
  const archived = item.archived ?? (item.priceCents > 0 && !paid);
  const visibility: models.ProductVisibility = item.visibility ?? "public";
  const found = await findProduct(polar, item.code);
  if (found === undefined) {
    const shared = {
      description: item.description,
      metadata: tagged(item.code),
      name: item.name,
      prices: pricesFor(item),
      visibility,
    };
    const created = await createProducts(polar)(
      item.recurring ? { ...shared, recurring_interval: "month" } : shared
    );
    return archived
      ? await updateProducts(polar)(created.id, { is_archived: true })
      : created;
  }
  const price = fixedPrice(found);
  const priceCents =
    price !== undefined && "price_amount" in price ? price.price_amount : 0;
  if (
    found.name === item.name &&
    found.description === item.description &&
    priceCents === item.priceCents &&
    found.is_archived === archived &&
    found.visibility === visibility
  ) {
    return found;
  }
  // A changed price is a new price on the product; current subscribers keep
  // theirs until they change plan (Polar's rule).
  return await updateProducts(polar)(found.id, {
    description: item.description,
    is_archived: archived,
    name: item.name,
    visibility,
    ...(priceCents === item.priceCents ? {} : { prices: pricesFor(item) }),
  });
};

// Where a secret the seed makes goes: the webhook endpoint's signing secret
// (Polar shows it only when the endpoint is created or its secret reset) and
// each promo's code. It is written straight to its store and never printed:
// Secret Manager in CI (GCP_PROJECT_ID set), else a gitignored env file.
interface SecretSink {
  has: () => Promise<boolean>;
  name: string;
  put: (secret: string) => Promise<void>;
}

// Pulumi's first version of polar-webhook-secret (infra/index.ts), so Cloud
// Run starts before the seed has written the real one.
const PLACEHOLDER = "pending-polar-seed";

// gRPC's NOT_FOUND, for a secret that doesn't exist yet.
const GRPC_NOT_FOUND = 5;

const isNotFound = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === GRPC_NOT_FOUND;

let secretManager: SecretManagerServiceClient | undefined;

// A promo's secret is made on its first code; Pulumi makes the webhook's.
const secretManagerSink = (project: string, secretId: string): SecretSink => {
  secretManager ??= new SecretManagerServiceClient();
  const client = secretManager;
  const parent = `projects/${project}/secrets/${secretId}`;
  const add = async (secret: string) => {
    await client.addSecretVersion({
      parent,
      payload: { data: Buffer.from(secret) },
    });
  };
  return {
    has: async () => {
      try {
        const [latest] = await client.accessSecretVersion({
          name: `${parent}/versions/latest`,
        });
        const data = latest.payload?.data;
        const value =
          typeof data === "string" ? data : Buffer.from(data ?? "").toString();
        return value !== "" && value !== PLACEHOLDER;
      } catch {
        return false;
      }
    },
    name: parent,
    put: async (secret) => {
      try {
        await add(secret);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
        await client.createSecret({
          parent: `projects/${project}`,
          secret: { replication: { automatic: {} } },
          secretId,
        });
        await add(secret);
      }
    },
  };
};

const fileSink = (path: string, key: string): SecretSink => ({
  has: () =>
    Promise.resolve(
      existsSync(path) && readFileSync(path, "utf-8").includes(`${key}=`)
    ),
  name: path,
  put: (secret) => {
    appendFileSync(path, `${key}=${secret}\n`);
    return Promise.resolve();
  },
});

const sinkFor = (secretId: string, fallbackPath: string): SecretSink => {
  const project = process.env["GCP_PROJECT_ID"];
  return project === undefined || project === ""
    ? fileSink(fallbackPath, secretId.toUpperCase().replaceAll("-", "_"))
    : secretManagerSink(project, secretId);
};

// Codes customers type: 16 characters from an alphabet without look-alikes
// (no 0/O, 1/I), 80 random bits, so a code can't be guessed. 256 is a
// multiple of the alphabet's 32 letters, so every letter is equally likely.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

const randomCode = () =>
  [...randomBytes(CODE_LENGTH)]
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join("");

// A code chosen for a promo (CI variable POLAR_PROMO_CODE_<ID>), if any.
const chosenCode = (promo: Promo) => {
  const value =
    process.env[
      `POLAR_PROMO_CODE_${promo.id.toUpperCase().replaceAll("-", "_")}`
    ];
  return value === undefined || value === "" ? undefined : value;
};

type Discount = models.Discount;

const discountTerms = (promo: Promo, productId: string) => ({
  ends_at: promo.endsAt,
  max_redemptions: promo.maxRedemptions,
  // One redemption per merchant; the webhook enforces it again.
  max_redemptions_per_customer: 1,
  name: `wovain ${promo.name}`,
  products: [productId],
  starts_at: promo.startsAt ?? null,
});

const sameTerms = (found: Discount, terms: ReturnType<typeof discountTerms>) =>
  found.name === terms.name &&
  found.max_redemptions === terms.max_redemptions &&
  found.max_redemptions_per_customer === terms.max_redemptions_per_customer &&
  found.ends_at !== null &&
  new Date(found.ends_at).getTime() === new Date(terms.ends_at).getTime() &&
  (found.starts_at === null
    ? terms.starts_at === null
    : terms.starts_at !== null &&
      new Date(found.starts_at).getTime() ===
        new Date(terms.starts_at).getTime()) &&
  found.products.length === 1 &&
  found.products[0]?.id === terms.products[0] &&
  "basis_points" in found &&
  found.basis_points === 10_000;

// A promo's 100%-off code on its product. An off promo loses its discount,
// so the code stops working in Polar too. The code is kept across runs
// (Polar's discount holds it) and copied into the store when it's missing.
const ensurePromoDiscount = async (
  polar: PolarCore,
  promo: Promo,
  productId: string
) => {
  const tag = promoTag(promo.id);
  const found = await first(iterListDiscounts(polar)(), (discount) =>
    hasTag(discount.metadata, tag)
  );
  if (!promo.enabled) {
    if (found !== undefined) {
      await deleteDiscounts(polar)(found.id);
      return "deleted (promo off)";
    }
    return "none (promo off)";
  }
  const sink = sinkFor(promoSecretId(promo.id), ".env.polar-promos");
  const terms = discountTerms(promo, productId);
  const chosen = chosenCode(promo);
  if (found === undefined) {
    const code = chosen ?? randomCode();
    const created = await createDiscounts(polar)({
      ...terms,
      basis_points: 10_000,
      code,
      duration: "once",
      metadata: tagged(tag),
      type: "percentage",
    });
    await sink.put(code);
    return `created ${created.id}; code stored in ${sink.name}`;
  }
  const recode = chosen !== undefined && chosen !== found.code;
  if (!sameTerms(found, terms) || recode) {
    // A discount's type and amount can't change once redeemed; the terms
    // above can.
    await updateDiscounts(polar)(found.id, {
      ...terms,
      ...(recode ? { code: chosen } : {}),
    });
  }
  const code = recode ? chosen : found.code;
  if (code !== null && (recode || !(await sink.has()))) {
    await sink.put(code);
    return `kept ${found.id}; code stored in ${sink.name}`;
  }
  return `kept ${found.id}`;
};

// Keeps an existing endpoint (and its secret) unless the store has no secret
// for it, in which case the secret is rotated into the store.
const ensureWebhook = async (
  polar: PolarCore,
  url: string,
  sink: SecretSink
) => {
  const events = [...POLAR_WEBHOOK_EVENTS];
  const found = await first(
    iterListWebhookEndpointsWebhooks(polar)(),
    (endpoint) => endpoint.url === url
  );
  if (found === undefined) {
    const created = await createWebhookEndpointWebhooks(polar)({
      api_version: "2026-10",
      events,
      format: "raw",
      name: "wovain",
      url,
    });
    await sink.put(created.secret);
    return `created ${created.id}; secret stored in ${sink.name}`;
  }
  await updateWebhookEndpointWebhooks(polar)(found.id, { events });
  if (await sink.has()) {
    return `kept ${found.id}`;
  }
  const rotated = await resetWebhookEndpointSecretWebhooks(polar)(found.id);
  await sink.put(rotated.secret);
  return `kept ${found.id}; secret rotated into ${sink.name}`;
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
  // Matches the app's billing-paid-plans flag: off until paid plans launch.
  const paid = process.env["POLAR_PAID_PLANS"] === "on";
  const meter = await ensureMeter(polar);
  console.info(`polar:${environment} meter ${meter.name} ${meter.id}`);
  for (const item of ITEMS) {
    // In order: each product links the benefit made just before it.
    // oxlint-disable-next-line no-await-in-loop
    const benefit = await ensureBenefit(polar, meter.id, item);
    // oxlint-disable-next-line no-await-in-loop
    const product = await ensureProduct(polar, item, paid);
    // oxlint-disable-next-line no-await-in-loop
    await updateBenefitsProducts(polar)(product.id, { benefits: [benefit.id] });
    console.info(
      `polar:${environment} ${item.code} ${dollars(item.priceCents)} product ${product.id}${product.is_archived ? " (archived)" : ""} benefit ${benefit.id}`
    );
  }
  for (const [index, promo] of PROMOS.entries()) {
    const item = PROMO_ITEMS[index];
    if (item === undefined) {
      continue;
    }
    // In order, like the plans: the discount needs the product.
    // oxlint-disable-next-line no-await-in-loop
    const benefit = await ensureBenefit(polar, meter.id, item);
    // oxlint-disable-next-line no-await-in-loop
    const product = await ensureProduct(polar, item, paid);
    // oxlint-disable-next-line no-await-in-loop
    await updateBenefitsProducts(polar)(product.id, { benefits: [benefit.id] });
    // oxlint-disable-next-line no-await-in-loop
    const discount = await ensurePromoDiscount(polar, promo, product.id);
    // The code itself is never logged.
    console.info(
      `polar:${environment} promo ${promo.id} ${promo.credits} credits product ${product.id}${product.is_archived ? " (archived)" : ""} discount ${discount}`
    );
  }
  const webhookUrl = process.env["POLAR_WEBHOOK_URL"];
  if (webhookUrl !== undefined && webhookUrl !== "") {
    // Each environment's own secret, e.g. polar-webhook-secret-next
    // (infra/dev.ts); production's by default.
    const sink = sinkFor(
      process.env["POLAR_WEBHOOK_SECRET_ID"] ?? "polar-webhook-secret",
      process.env["POLAR_WEBHOOK_SECRET_OUT"] ?? ".env.polar-webhook"
    );
    const outcome = await ensureWebhook(polar, webhookUrl, sink);
    console.info(`polar:${environment} webhook ${webhookUrl} ${outcome}`);
  }
};

await main();
