import { expect, test } from "./fixtures";

// Use case 7: Billing shows the Free credits, and a promo code goes through
// the redeem path (Polar mocked in the pr suite).
test("billing shows the Free credits and redeems a code @smoke", async ({
  merchant: _merchant,
  page,
}) => {
  await page.goto("/dashboard/billing");
  await expect(page.getByText("Credits left")).toBeVisible();
  await expect(page.getByText(/Free/u).first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "Promo code" })
    .fill("E2E-NOT-A-CODE");
  await page.getByRole("button", { name: "Redeem" }).click();
  await expect(
    page.getByText("That code isn't valid. Check it and try again.")
  ).toBeVisible();
});

// Use case 8: the app's main places. Home is "Overview" until the story-ui
// rail, which also adds Settings; before it, Settings is in the account
// menu.
const PLACES = [
  ["Home", /^(?:Home|Overview)$/u, /\/dashboard(?:\/onboarding)?$/u],
  ["Drops", /^Drops$/u, /\/dashboard\/drops/u],
  ["Store", /^Store$/u, /\/dashboard\/store/u],
] as const;

for (const [place, name, url] of PLACES) {
  test(`${place} in the navigation @smoke`, async ({
    merchant: _merchant,
    page,
  }) => {
    await page.goto("/dashboard/billing");
    await page.getByRole("link", { name }).first().click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("main")).toBeVisible();
  });
}

test("Settings in the navigation @smoke", async ({
  merchant: _merchant,
  page,
}) => {
  await page.goto("/dashboard/billing");
  const rail = page.getByRole("link", { exact: true, name: "Settings" });
  const account = page.getByRole("button", { name: /\(Account\)$/u });
  // Wait for the shell, then take whichever entry it has.
  await expect(rail.or(account)).toBeVisible();
  if (await rail.isVisible()) {
    await rail.click();
  } else {
    await account.click();
    await page.getByRole("menuitem", { name: "Account settings" }).click();
  }
  await expect(page).toHaveURL(/\/dashboard\/settings/u);
});
