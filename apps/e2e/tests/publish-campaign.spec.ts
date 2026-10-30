import { design, idea, product, run } from "@wovain/db/schema/seller";

import { ART_URL } from "../mocks/fal.ts";
import { db, expect, isSmoke, test } from "./fixtures";

// A drop whose products are made and hidden: the run has completed, the
// merchant still publishes and launches.
const seedDrop = async (
  userId: string,
  made: Partial<typeof product.$inferInsert> = {}
) => {
  if (db === undefined) {
    throw new Error("The pr suite seeds the database");
  }
  const [started] = await db
    .insert(run)
    .values({
      seed: "Desert dusk tees",
      status: "completed",
      step: "publish",
      userId,
    })
    .returning();
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {
        rank: 1,
        references: [],
        score: 80,
        signals: {
          affinity: 0.8,
          ipSafety: 1,
          margin: 0.5,
          marketHits: 3,
          newsHits: 2,
          recency: 0.5,
          relevance: 0.5,
        },
        sources: [],
        theme: "Desert",
      } as never,
      runId: started?.id ?? null,
      score: 80,
      seed: "Desert dusk tees",
      theme: "Desert",
      userId,
    })
    .returning();
  const [drafted] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: ART_URL,
      artworkWidth: 10,
      brief: {
        artPrompt: "dunes",
        description: "Dunes at dusk",
        garmentColors: [],
        printedText: [],
        title: "Dune Tee",
      },
      ideaId: found?.id ?? "",
      judgment: {
        checks: [],
        coach: "",
        fixes: [],
        score: 90,
        verdict: "ready",
      },
      runId: started?.id ?? null,
      status: "approved",
      userId,
    })
    .returning();
  const [saved] = await db
    .insert(product)
    .values({
      catalogProductId: "prd_tee",
      customizationId: "cus_1",
      designId: drafted?.id ?? "",
      mediaUri: ART_URL,
      mockups: [ART_URL],
      offerId: "off_1",
      price: 32,
      userId,
      ...made,
    })
    .returning();
  if (started === undefined || saved === undefined) {
    throw new Error("The drop wasn't seeded");
  }
  return { product: saved, runId: started.id };
};

// The founder's path: Publish in the drop's Products step is the approval
// (one confirm naming product, price and shop), and the drop goes on to its
// Campaign step. Fourthwall's publish is answered here, never sent; without
// Meta the step shows the creatives and how to connect it.
test("publishing in the drop flow goes on to the campaign step", async ({
  merchant,
  page,
}) => {
  test.skip(isSmoke, "Seeds the database and never publishes for real.");
  test.setTimeout(90_000);
  const { product: hidden, runId } = await seedDrop(merchant.id ?? "");
  let published = 0;
  await page.route("**/api/rpc/products/publish", async (route) => {
    published += 1;
    await route.fulfill({
      contentType: "application/json",
      json: {
        json: {
          ...hidden,
          approval: null,
          productUrl: "https://shop.example/dune-tee",
          status: "public",
        },
      },
    });
  });

  await page.goto(`/dashboard/new?run=${runId}&step=products`);
  await expect(
    page.getByRole("heading", { name: "Publish the products" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish to Fourthwall" }).click();

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Publish “Dune Tee”?");
  await expect(confirm).toContainText("$32.00");
  await confirm.getByRole("button", { name: "Publish now" }).click();
  await expect.poll(() => published).toBe(1);

  await expect(
    page.getByRole("heading", { name: "Launch the campaign" })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Dune Tee, ad image" })
  ).toBeVisible();
  await expect(page.getByText("Connect Meta to launch")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Launch campaign" })
  ).toBeDisabled();

  // The progress ticks every step before the campaign, which is current.
  const tape = page
    .getByRole("list", { name: "Drop progress: Campaign" })
    .first();
  await expect(tape).toContainText("Products: done");
  await expect(tape).toContainText("Campaign: current");
});

// A live product's video ad clips (openspec video-ad-creatives) show in the
// Campaign step next to its images: playable and muted. The clip is seeded,
// never made on fal.
test("the campaign step plays the product's video ads", async ({
  merchant,
  page,
}) => {
  test.skip(isSmoke, "Seeds the database.");
  const { runId } = await seedDrop(merchant.id ?? "", {
    productUrl: "https://shop.example/dune-tee",
    status: "public",
    videos: [{ aspect: "9:16", url: "https://fal.example/dune-tee.mp4" }],
  });
  await page.goto(`/dashboard/new?run=${runId}&step=campaign`);
  await expect(
    page.getByRole("heading", { name: "Launch the campaign" })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Dune Tee, ad image" })
  ).toBeVisible();
  const clip = page.getByLabel("Dune Tee, video ad");
  await expect(clip).toBeVisible();
  await expect(clip).toHaveJSProperty("muted", true);
});
