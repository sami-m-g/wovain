import { beforeEach, describe, expect, it, vi } from "vitest";

import { identifyMerchant } from "@/lib/analytics-client";
import { wovainAuthClient } from "@/lib/auth-client-plugin";
import { resetAnalytics } from "@/lib/consent-store";

// The browser-only modules the plugin calls; the plugin's own logic is real.
vi.mock("@/lib/analytics-client", () => ({ identifyMerchant: vi.fn() }));
vi.mock("@/lib/consent-store", () => ({ resetAnalytics: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "en" ? href : `/${locale}${href}`,
}));
vi.mock("@/i18n/routing", () => ({
  routing: { defaultLocale: "en", locales: ["en", "fr", "es"] },
}));

const pluginOf = () => {
  const [found] = wovainAuthClient().fetchPlugins;
  if (found === undefined) {
    throw new Error("wovainAuthClient has no fetch plugin");
  }
  return found;
};
const plugin = pluginOf();
const AUTH = "https://wovain.com/api/auth";

const setPageLocale = (lang: string) => {
  vi.stubGlobal("document", { documentElement: { lang } });
};

const bodyAfterInit = async (path: string, body: Record<string, unknown>) => {
  const result = await plugin.init(`${AUTH}${path}`, { body });
  return result.options?.body;
};

const succeed = async (path: string, data: unknown) => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the hook reads only request.url and data
  const context = { data, request: { url: `${AUTH}${path}` } } as Parameters<
    typeof plugin.hooks.onSuccess
  >[0];
  await plugin.hooks.onSuccess(context);
};

beforeEach(() => {
  vi.clearAllMocks();
  setPageLocale("en");
});

describe("wovainAuthClient's init", () => {
  it("adds the page's locale to a same-site callback", async () => {
    setPageLocale("fr");
    expect(
      await bodyAfterInit("/sign-in/email", {
        callbackURL: "/dashboard",
        email: "a@b.c",
      })
    ).toStrictEqual({ callbackURL: "/fr/dashboard", email: "a@b.c" });
  });

  it("leaves prefixed, protocol-relative and absolute URLs alone", async () => {
    setPageLocale("fr");
    expect(
      await bodyAfterInit("/sign-in/email", {
        callbackURL: "/fr/dashboard",
        errorCallbackURL: "//evil.com",
        redirectTo: "https://wovain.com/x",
      })
    ).toStrictEqual({
      callbackURL: "/fr/dashboard",
      errorCallbackURL: "//evil.com",
      redirectTo: "https://wovain.com/x",
    });
  });

  it("sends a Google sign-in without callbacks to the error view and onboarding", async () => {
    setPageLocale("es");
    expect(
      await bodyAfterInit("/sign-in/social", { provider: "google" })
    ).toStrictEqual({
      errorCallbackURL: "/es/auth-error",
      newUserCallbackURL: "/es/dashboard/connections",
      provider: "google",
    });
  });
});

describe("wovainAuthClient's onSuccess", () => {
  it("identifies the merchant after a sign-in or sign-up", async () => {
    await succeed("/sign-in/email", { user: { id: "user-1" } });
    await succeed("/sign-up/email", { user: { id: "user-2" } });
    expect(vi.mocked(identifyMerchant).mock.calls).toStrictEqual([
      ["user-1"],
      ["user-2"],
    ]);
    expect(resetAnalytics).not.toHaveBeenCalled();
  });

  it("resets analytics on every sign-out", async () => {
    await succeed("/sign-out", { success: true });
    await succeed("/revoke-sessions", { status: true });
    expect(resetAnalytics).toHaveBeenCalledTimes(2);
    expect(identifyMerchant).not.toHaveBeenCalled();
  });

  it("ignores other endpoints and answers without a user", async () => {
    await succeed("/get-session", { user: { id: "user-1" } });
    await succeed("/sign-in/email", { redirect: true });
    expect(identifyMerchant).not.toHaveBeenCalled();
    expect(resetAnalytics).not.toHaveBeenCalled();
  });
});
