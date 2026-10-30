import {
  expect,
  isSmoke,
  signInWithPassword,
  test,
  uniqueEmail,
  verificationLink,
} from "./fixtures";

// Use case 1: sign up, verify the email, sign out and sign back in.
test("sign up, verify, sign out and sign in", async ({ page }) => {
  test.skip(isSmoke, "Needs the app's secret to sign the verification link");
  const email = uniqueEmail("signup");
  const password = "e2e-Password-123!";

  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Name" }).fill("E2E Sign Up");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  const passwordBox = page.getByRole("textbox", { name: "Password" });
  await passwordBox.fill(password);
  await expect(passwordBox).toHaveValue(password);
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" })
  ).toBeVisible();

  await page.goto(await verificationLink(email));
  // A new merchant lands on Home, or the setup guide before story-ui.
  await expect(page).toHaveURL(/\/dashboard(?:\/onboarding)?$/u);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /\(Account\)$/u }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).not.toHaveURL(/\/dashboard/u);

  await signInWithPassword(page, email, password);
});

test("the seeded account signs in @smoke", async ({ merchant, page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/u);
  expect(merchant.email).toContain("@");
});
