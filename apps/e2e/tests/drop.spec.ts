import type { Page } from "@playwright/test";

import { expect, isSmoke, test } from "./fixtures";

// Live Qloo can take far longer than the default expect timeout: wait for
// the loading line to go, then require the panel to settle on its source
// line or its failure message, never to hang loading.
const expectWhoBuysSettled = async (page: Page) => {
  await expect(page.getByText(/Asking Qloo who buys this/u)).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(
    page
      .getByText(
        /brands are for targeting only|reach our taste data to say who buys this/u
      )
      .first()
  ).toBeVisible();
};

// Use case 3: New drop shows what sells now, each direction with its
// evidence (news, listings) and who buys it, or an honest empty state that
// says why.
test("what sells now: directions with evidence, or why there are none @smoke", async ({
  merchant: _merchant,
  page,
}) => {
  // The 60 s settle wait and the 60 s directions wait outlast the default.
  test.setTimeout(isSmoke ? 180_000 : 90_000);
  await page.goto("/dashboard/new");
  await expect(
    page.getByRole("heading", { name: /^What to sell now/u })
  ).toBeVisible();
  const direction = page.getByRole("button", { name: "Start this drop" });
  const empty = page.getByText(/Qloo found nothing new rising right now/u);
  await expect(direction.first().or(empty)).toBeVisible({ timeout: 60_000 });
  // Real providers may honestly find nothing; the mocked ones always do. A
  // failed Qloo read ("We couldn't reach our taste data") is no such state.
  if (isSmoke && (await empty.isVisible())) {
    return;
  }
  await expect(direction.first()).toBeVisible();
  // The mocked news and listings always come back; live ones may be skipped.
  const news = isSmoke
    ? /news stor(?:y|ies) this month|news not checked/u
    : /\d+ news stor(?:y|ies) this month/u;
  const listings = isSmoke
    ? /similar listings?|listings not checked/u
    : /reviews on similar listings/u;
  await expect(page.getByText(news).first()).toBeVisible();
  await expect(page.getByText(listings).first()).toBeVisible();
  await page.getByRole("button", { name: "Who buys this" }).first().click();
  // The age line needs Qloo demographics; the source line is always there.
  await expectWhoBuysSettled(page);
});

// Use case 4: a typed brief, then trends, ideas, pick, designs and approve.
test("a typed brief: trends, ideas, pick, designs, approve @smoke", async ({
  merchant: _merchant,
  page,
}) => {
  // Real research and art take minutes on next; the mocks take seconds.
  test.setTimeout(isSmoke ? 480_000 : 90_000);
  await page.goto("/dashboard/new");
  await page
    .getByRole("textbox", { name: "What should this drop be about?" })
    .fill("Cozy botanical tees for plant lovers, Studio Ghibli fans");
  await page.getByRole("button", { name: "Research trends" }).click();

  await expect(
    page.getByRole("heading", { name: "Pick the ideas" })
  ).toBeVisible({
    timeout: 120_000,
  });
  // Each idea with its evidence, who buys it and its competition.
  await expect(
    page.getByRole("link", { name: /^\[1\]/u }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Who buys this" }).first()
  ).toBeVisible();
  await expectWhoBuysSettled(page);
  // How crowded it is: the listings read, and the competition panel
  // when the tavily-competition read has come back.
  await expect(
    page.getByRole("term").filter({ hasText: "Listings" }).first()
  ).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "See designs" }).click();

  await expect(
    page.getByRole("heading", { name: "Approve the designs" })
  ).toBeVisible({ timeout: 180_000 });
  await expect(
    page.getByRole("img", { name: /^Design: /u }).first()
  ).toBeVisible({
    timeout: 180_000,
  });
  if (isSmoke) {
    // The smoke suite stops at the designs: approving publishes for real.
    return;
  }
  await page
    .getByRole("button", { name: /^Approve(?: anyway)?$/u })
    .first()
    .click();
  await expect(page.getByText("Approved").first()).toBeVisible();
});
