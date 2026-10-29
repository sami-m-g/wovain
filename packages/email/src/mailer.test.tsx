import { render } from "@react-email/render";
import { log } from "evlog";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose, pickLocale } from "./emails";
import { createMailer } from "./mailer";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  send.mockReset();
});

const site = "https://wovain.com";

describe("emails", () => {
  it("picks the most preferred supported language, else English", () => {
    expect(pickLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(pickLocale("de-DE, es;q=0.7")).toBe("es");
    expect(pickLocale("en;q=0.1, fr;q=0.9")).toBe("fr");
    expect(pickLocale("*, not a tag")).toBe("en");
    expect(pickLocale("de")).toBe("en");
    expect(pickLocale()).toBe("en");
  });

  it("writes each email in the merchant's language", async () => {
    const verify = compose({ kind: "verify", url: `${site}/v` }, "fr");
    expect(verify.subject).toBe("Vérifiez votre e-mail");
    const run = compose(
      {
        kind: "run",
        seed: "pickleball",
        status: "awaiting_approval",
        url: `${site}/r`,
      },
      "es"
    );
    expect(run.subject).toBe("Un diseño necesita tu aprobación");
    const text = await render(run.element, { plainText: true });
    expect(text).toContain('"pickleball"');
    expect(text).toContain(`${site}/r`);
  });

  it("heads an alert by its type, in the merchant's language", async () => {
    const alert = compose(
      {
        alert: "scale_request",
        body: "3 sales at 2x ROAS.",
        kind: "alert",
        title: "A product is selling: raise its budget?",
        url: `${site}/dashboard/autopilot`,
      },
      "fr"
    );
    expect(alert.subject).toBe(
      "Un produit se vend: A product is selling: raise its budget?"
    );
    const text = await render(alert.element, { plainText: true });
    expect(text).toContain("raise its budget? 3 sales at 2x ROAS.");
    expect(text).toContain("Paramètres > Alertes");
  });
});

describe("createMailer", () => {
  it("logs the email when there's no Resend key", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const mail = createMailer({
      apiKey: undefined,
      from: "wovain <support@wovain.com>",
      siteUrl: site,
    });

    await mail({
      message: { kind: "reset", url: `${site}/reset?token=t` },
      to: "m@example.com",
    });

    expect(send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith({
      email: expect.objectContaining({
        kind: "reset",
        subject: "Reset your password",
        to: "m@example.com",
      }),
    });
  });

  it("sends through Resend with links resolved against the site", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    send.mockResolvedValue({ data: { id: "e1" }, error: null });
    const mail = createMailer({
      apiKey: "re_test",
      from: "wovain <support@wovain.com>",
      siteUrl: site,
    });

    await mail({
      locale: "en",
      message: {
        kind: "run",
        seed: "anime",
        status: "completed",
        url: "/dashboard?run=r1",
      },
      to: "m@example.com",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "wovain <support@wovain.com>",
        subject: "Your run is finished",
        to: "m@example.com",
      })
    );
    expect(send.mock.calls[0]?.[0].html).toContain(`${site}/dashboard?run=r1`);
    // Resend's id is logged, so a missing email can be traced in Resend.
    expect(info).toHaveBeenCalledWith({ email: { id: "e1", kind: "run" } });
  });

  it("fails with a structured error when Resend refuses", async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });
    const mail = createMailer({
      apiKey: "re_test",
      from: "x <x@wovain.com>",
      siteUrl: site,
    });

    await expect(
      mail({
        message: { kind: "verify", url: `${site}/v` },
        to: "m@example.com",
      })
    ).rejects.toMatchObject({
      code: "RESEND_FAILED",
      why: "domain not verified",
    });
  });
});
