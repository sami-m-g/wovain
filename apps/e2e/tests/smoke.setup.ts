import { test as setup } from "@playwright/test";

import { signInWithPassword, SMOKE_EMAIL, SMOKE_STATE } from "./fixtures.ts";

// One sign-in for the whole smoke suite: Better Auth allows 5 sign-ins a
// minute per IP (packages/auth), and the specs would otherwise make one each.
setup("sign in the seeded account", async ({ page }) => {
  await signInWithPassword(
    page,
    SMOKE_EMAIL,
    process.env["E2E_PASSWORD"] ?? ""
  );
  await page.context().storageState({ path: SMOKE_STATE });
});
