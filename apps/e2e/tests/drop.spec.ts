import { expect, isSmoke, test } from "./fixtures";

// Use case 3: New drop shows what sells now, each direction with its
// evidence (news, listings) and who buys it, or an honest empty state that
// says why.
test("what sells now: directions with evidence, or why there are none @smoke", async ({
  merchant: _merchant,
  page,
}) => {
  await page.goto("/dashboard/new");
  await expect(
    page.getByRole("heading", { name: /^What to sell now/u })
  ).toBeVisible();
  const direction = page.getByRole("button", { name: "Start this drop" });
  const empty = page.getByText(
    /Qloo found nothing new rising right now|We couldn't reach our taste data/u
  );
  await expect(direction.first().or(empty)).toBeVisible({ timeout: 60_000 });
  // Real providers may honestly find nothing; the mocked ones always do.
  if (isSmoke && (await empty.isVisible())) {
    return;
  }
  await expect(direction.first()).toBeVisible();
  await expect(
    page.getByText(/news stor(?:y|ies) this month|news not checked/u).first()
  ).toBeVisible();
  await expect(
    page.getByText(/similar listings?|listings not checked/u).first()
  ).toBeVisible();
  await page.getByRole("button", { name: "Who buys this" }).first().click();
  await expect(page.getByText(/^Mostly /u).first()).toBeVisible();
});

// Use case 4: a typed brief, then trends, ideas, pick, designs and approve.
test("a typed brief: trends, ideas, pick, designs, approve @smoke", async ({
  merchant: _merchant,
  page,
}) => {
  // Real research and art take minutes on next; the mocks take seconds.
  test.setTimeout(isSmoke ? 360_000 : 90_000);
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
