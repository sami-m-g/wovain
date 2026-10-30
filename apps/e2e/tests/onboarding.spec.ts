import { expect, test } from "./fixtures";

// Use case 2: onboarding, skipping the brand or answering the questions.
test("skip the brand: just help me sell", async ({
  merchant: _merchant,
  page,
}) => {
  await page.goto("/dashboard/onboarding");
  await page.getByText(/^Add your brand \(optional\)/u).click();
  await page.getByRole("button", { name: "Skip, just help me sell" }).click();
  // No brand: the guide goes on with what sells now, for anyone.
  await expect(page.getByText("Ask me a few questions")).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Start this drop$/u }).first()
  ).toBeVisible();
});

test("the brand questionnaire leads to starter brands", async ({
  merchant: _merchant,
  page,
}) => {
  await page.goto("/dashboard/onboarding");
  await page.getByText(/^Add your brand \(optional\)/u).click();
  await page.getByText("Ask me a few questions").click();
  await page.getByRole("button", { name: "Cosy" }).click();
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await page.getByRole("button", { name: "Coffee" }).click();
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await page.getByRole("button", { name: "Side income" }).click();
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await page.getByRole("button", { name: "Approve the big calls" }).click();
  await page.getByRole("button", { name: "Show my starter brands" }).click();
  // Starter brands, or the honest "too little to go on" with the credit.
  await expect(
    page
      .getByRole("button", { name: "Use this" })
      .first()
      .or(page.getByText(/^We found too little to suggest a brand/u))
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Taste data by Qloo")).toBeVisible();
});
