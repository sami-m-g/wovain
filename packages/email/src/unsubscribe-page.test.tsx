import { expect, it } from "vitest";

import { unsubscribePage } from "./unsubscribe-page";

it("shows a confirm button that posts to the link, in the reader's language", async () => {
  const html = await unsubscribePage("fr", {
    action: "/api/unsubscribe?token=a.b",
    view: "confirm",
  });
  expect(html).toContain('lang="fr"');
  expect(html).toContain('action="/api/unsubscribe?token=a.b"');
  expect(html).toContain("Se désabonner");
});

it("says so when the link is not valid", async () => {
  expect(await unsubscribePage("en", { view: "invalid" })).toContain(
    "isn&#x27;t valid"
  );
});
