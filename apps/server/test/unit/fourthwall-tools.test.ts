import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "vitest";
import { z } from "zod";

import { ads } from "../../src/playbooks/ads.ts";
import { autopilot } from "../../src/playbooks/autopilot.ts";
import { campaign } from "../../src/playbooks/campaign.ts";
import { design } from "../../src/playbooks/design.ts";
import { instructions } from "../../src/playbooks/index.ts";
import { allowlists } from "../../src/tools/connections.ts";

// The tool names Fourthwall's /app endpoint really has (its tools/list).
const upstream = new Set(
  z
    .object({ tools: z.array(z.string()) })
    .parse(
      JSON.parse(
        readFileSync(
          new URL("../fixtures/fourthwall-tools.json", import.meta.url),
          "utf-8"
        )
      )
    ).tools
);

// Fourthwall tools use hyphens (ecommerce_get-current-shop,
// request-upload-url) or the omni_ prefix; wovain's, fal's and Meta's don't.
const fourthwallName = /^(?:(?:ecommerce|omni)_[a-z-]+|[a-z]+(?:-[a-z]+)+)$/u;

const backticked = (text: string) =>
  [...text.matchAll(/`(?<name>[^`\s]+)`/gu)]
    .map((match) => match.groups?.["name"] ?? "")
    .filter((name) => fourthwallName.test(name));

test("every Fourthwall tool the design playbook names is allowlisted and real", () => {
  const named = new Set(backticked(design.text));
  // The design flow's reads: the shop, blanks, upload, mockups and costs.
  expect([...named]).toEqual(
    expect.arrayContaining([
      "ecommerce_get-current-shop",
      "ecommerce_get-catalog-products",
      "ecommerce_get-catalog-product-details",
      "ecommerce_request-media-upload-link",
      "ecommerce_save-media-library-image",
      "ecommerce_generate-product-design-previews",
      "ecommerce_get-customization-pricing",
    ])
  );
  const allowed: readonly string[] = allowlists.fourthwall;
  for (const name of named) {
    expect(allowed, name).toContain(name);
  }
});

test("no playbook or instruction names a Fourthwall tool the upstream lacks", () => {
  const texts = [ads, autopilot, campaign, design].map(({ text }) => text);
  for (const name of backticked([instructions, ...texts].join("\n"))) {
    expect(upstream.has(name), name).toBe(true);
  }
});

test("the fourthwall proxy allowlists only tools Fourthwall has", () => {
  for (const name of allowlists.fourthwall) {
    expect(upstream.has(name), name).toBe(true);
  }
});

test("wovain's own Fourthwall calls name real tools", () => {
  const dir = new URL("../../src/lib/", import.meta.url);
  const source = readdirSync(dir)
    .map((file) => readFileSync(new URL(file, dir), "utf-8"))
    .join("\n");
  const called = new Set(
    [...source.matchAll(/"(?<name>ecommerce_[a-z-]+)"/gu)].map(
      (match) => match.groups?.["name"] ?? ""
    )
  );
  expect(called.size).toBeGreaterThan(0);
  for (const name of called) {
    expect(upstream.has(name), name).toBe(true);
  }
});
