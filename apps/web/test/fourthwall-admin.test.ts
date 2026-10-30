import { describe, expect, it } from "vitest";

import { fourthwallAdminUrl } from "@/lib/fourthwall-admin";

describe("fourthwallAdminUrl", () => {
  it("opens the shop's own page from its slug", () => {
    expect(fourthwallAdminUrl("shipping", "wovain-goods")).toBe(
      "https://admin.fourthwall.com/store/wovain-goods/settings/shipping/"
    );
    expect(fourthwallAdminUrl("domain", "wovain-goods")).toBe(
      "https://admin.fourthwall.com/store/wovain-goods/settings/domain/"
    );
    expect(fourthwallAdminUrl("policies", "wovain-goods")).toBe(
      "https://admin.fourthwall.com/store/wovain-goods/store-design/layout/index/"
    );
  });

  it("lets the admin pick the shop without a slug", () => {
    for (const slug of [undefined, null, ""]) {
      expect(fourthwallAdminUrl("domain", slug)).toBe(
        "https://admin.fourthwall.com/?redirectPath=%2Fsettings%2Fdomain%2F"
      );
    }
  });

  it("keeps a slug from breaking out of its path", () => {
    expect(fourthwallAdminUrl("home", "a/b")).toBe(
      "https://admin.fourthwall.com/store/a%2Fb/"
    );
  });
});
