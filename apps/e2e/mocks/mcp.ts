import { HttpResponse, http } from "msw";

import { ART_URL } from "./fal.ts";

// The merchant's Fourthwall shop and Meta ad account, as their MCP servers
// answer over Streamable HTTP (JSON replies, no session). Each tool answers
// in the provider's real encoding, the shapes that broke on a real run:
// Fourthwall in TOON with its array headers on their own line
// (packages/core/src/plumbing.test.ts, #314), Meta with `ad_entities` and
// `ad_drafts` as JSON text (#355). Nothing here goes live or spends.

type Reply = (args: Record<string, unknown>) => string;

const SHOP = "https://e2e-shop.fourthwall.example";
const UPLOAD_URL = "https://uploads.fourthwall.example/e2e-art.png";
const OFFER_ID = "off_e2e";

const toon =
  (...lines: string[]) =>
  () =>
    lines.join("\n");

const fourthwallTools: Record<string, Reply> = {
  "confirm-image-upload": toon(`url: "${ART_URL}"`),
  "ecommerce_bulk-update-offer-variant-prices": toon("updated: 1"),
  "ecommerce_create-collection": toon("id: col_e2e"),
  "ecommerce_create-offers-from-designs": toon(
    "offers[1]:",
    `  - offerId: ${OFFER_ID}`,
    "    customizationId: cus_e2e"
  ),
  "ecommerce_generate-product-design-previews": toon(
    "results[1]:",
    "  - productId: pro_e2e_tee",
    "    customizationId: cus_e2e",
    `    images[1]: "${ART_URL}"`
  ),
  "ecommerce_get-catalog-product-details": toon(
    "data[1]:",
    "  - slug: comfort-colors-garment-dyed-heavyweight-t-shirt-dtg",
    "    colors[2]: Black,White",
    "    sizes[3]: S,M,L"
  ),
  // Fourthwall's catalog reply on next, 2026-10-30 (plumbing.test.ts).
  "ecommerce_get-catalog-products": toon(
    "pageNumber: 0",
    "pageSize: 10",
    "totalElements: 1",
    "totalPages: 1",
    "data[1]:",
    "  - id: pro_e2e_tee",
    "    brand: Comfort Colors",
    "    name: Comfort Colors Garment-Dyed Heavyweight T-Shirt",
    "    slug: comfort-colors-garment-dyed-heavyweight-t-shirt-dtg",
    "    categoryPath:",
    "    [2]: Apparel,T-Shirts",
    "    priceFrom: 15.45",
    "    printDetails:",
    "        supportsBackendRendering: true",
    "        printAreas:",
    "        [2]{name,type,supportsBackendRendering}:",
    "            Front,front_large,true",
    "            Back,back_large,true"
  ),
  "ecommerce_get-current-shop": toon(
    "id: sh_e2e",
    "name: E2E Shop",
    "status: LIVE",
    `baseUrl: "${SHOP}"`
  ),
  "ecommerce_get-offers-by-ids": toon(
    "data[1]:",
    `  - id: ${OFFER_ID}`,
    "    slug: e2e-tee"
  ),
  "ecommerce_get-payout-info": toon("status: ACTIVE"),
  "ecommerce_save-media-library-image": toon(`uri: "${ART_URL}"`),
  "ecommerce_update-offer-status": toon("status: PUBLIC"),
  "request-upload-url": toon(`signedUrl: "${UPLOAD_URL}"`, "uploadId: upl_e2e"),
};

// What Meta made stays a draft: only `ad_drafts` lists it.
const drafts: string[] = [];
const create =
  (level: string, key: string): Reply =>
  () => {
    const id = `${level}_e2e_${drafts.length + 1}`;
    drafts.push(id);
    return JSON.stringify({ [key]: id, success: true });
  };

const metaTools: Record<string, Reply> = {
  ads_create_ad: create("ad", "ad_id"),
  ads_create_ad_set: create("adset", "ad_set_id"),
  ads_create_campaign: create("campaign", "campaign_id"),
  ads_create_creative: create("creative", "creative_id"),
  ads_get_ad_account_pages: () =>
    JSON.stringify({ pages: [{ page_id: "pg_e2e", page_name: "E2E Shop" }] }),
  ads_get_ad_accounts: () =>
    JSON.stringify({
      ad_accounts: [
        {
          account_status: 1,
          ad_account_id: "act_e2e",
          ad_account_name: "E2E Ads",
          has_payment_method: true,
          is_ads_mcp_enabled: true,
        },
      ],
    }),
  // Meta's rows as JSON text: a staging that can't read them fails.
  ads_get_ad_entities: (args) =>
    JSON.stringify({
      ad_drafts: JSON.stringify(
        args["object_state"] === "draft"
          ? drafts.map((id) => ({ ad_object_id: id }))
          : []
      ),
      ad_entities: "[]",
    }),
  // The account's one pixel.
  ads_get_datasets: () =>
    JSON.stringify({ data: [{ id: "px_e2e", name: "E2E Shop pixel" }] }),
  ads_get_ig_accounts: () => JSON.stringify({ ig_accounts: [] }),
  ads_get_user_pages: () => JSON.stringify({ pages: [] }),
};

interface Rpc {
  id?: number | string;
  method: string;
  params?: {
    arguments?: Record<string, unknown>;
    name?: string;
    protocolVersion?: string;
  };
}

const answer = (name: string, tools: Record<string, Reply>, rpc: Rpc) => {
  if (rpc.method === "initialize") {
    return {
      capabilities: { tools: {} },
      protocolVersion: rpc.params?.protocolVersion,
      serverInfo: { name, version: "e2e" },
    };
  }
  if (rpc.method === "tools/list") {
    return { tools: [] };
  }
  const tool = rpc.params?.name ?? "";
  const reply = tools[tool];
  if (reply === undefined) {
    process.stderr.write(`[e2e] unmocked ${name} tool ${tool}\n`);
    return {
      content: [{ text: `Not mocked in e2e: ${tool}`, type: "text" }],
      isError: true,
    };
  }
  return {
    content: [{ text: reply(rpc.params?.arguments ?? {}), type: "text" }],
  };
};

const mcpServer = (name: string, url: string, tools: Record<string, Reply>) => [
  http.post(url, async ({ request }) => {
    const rpc = (await request.json()) as Rpc;
    // A notification gets no reply.
    if (rpc.id === undefined) {
      return new HttpResponse(null, { status: 202 });
    }
    return HttpResponse.json({
      id: rpc.id,
      jsonrpc: "2.0",
      result: answer(name, tools, rpc),
    });
  }),
  // No server-sent stream.
  http.get(url, () => new HttpResponse(null, { status: 405 })),
];

// The placeholder URLs CI builds with (.config/placeholder-env.sh).
export const mcp = [
  ...mcpServer(
    "fourthwall",
    "https://fourthwall.example.com/mcp",
    fourthwallTools
  ),
  ...mcpServer("meta", "https://meta.example.com/mcp", metaTools),
  http.put(UPLOAD_URL, () => new HttpResponse(null, { status: 200 })),
  // Meta's interest search (Graph API): each Qloo tag is one interest.
  http.get("https://graph.facebook.com/*/search", ({ request }) => {
    const name = new URL(request.url).searchParams.get("q") ?? "";
    return HttpResponse.json({
      data: [{ audience_size_lower_bound: 1_000_000, id: "6003e2e", name }],
    });
  }),
];
