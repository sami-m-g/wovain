import { render } from "@react-email/render";
import { log } from "evlog";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose, pickLocale } from "./emails";
import { createMailer } from "./mailer";
import { verifyUnsubscribeToken } from "./unsubscribe";

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
});

describe("createMailer", () => {
  it("logs the email when there's no Resend key", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const mail = createMailer({
      apiKey: undefined,
      from: "wovain <support@wovain.com>",
      replyTo: "support@wovain.com",
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
      replyTo: "support@wovain.com",
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

  it("marks run updates for one-click unsubscribe, not verification", async () => {
    vi.spyOn(log, "info").mockImplementation(() => {});
    send.mockResolvedValue({ data: { id: "e1" }, error: null });
    const mail = createMailer({
      apiKey: "re_test",
      from: "wovain <support@wovain.com>",
      replyTo: "support@wovain.com",
      siteUrl: site,
      unsubscribeSecret: "s3cret",
    });

    await mail({
      message: { kind: "run", seed: "a", status: "failed", url: "/d" },
      to: "m@example.com",
    });
    await mail({
      message: { kind: "verify", url: `${site}/v` },
      to: "m@example.com",
    });

    const [runSent, verifySent] = send.mock.calls.map(([sent]) => sent);
    expect(runSent.replyTo).toBe("support@wovain.com");
    expect(runSent.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    const header: string = runSent.headers["List-Unsubscribe"];
    expect(header).toContain("<mailto:support@wovain.com?subject=unsubscribe>");
    const link = /<(?<url>https:[^>]+)>/u.exec(header)?.groups?.["url"] ?? "";
    expect(runSent.html).toContain("Unsubscribe from run updates");
    expect(
      verifyUnsubscribeToken(
        "s3cret",
        new URL(link).searchParams.get("token") ?? ""
      )
    ).toBe("m@example.com");
    expect(verifySent.headers).toBeUndefined();
    expect(verifySent.html).not.toContain("Unsubscribe");
  });

  it("rejects a forged unsubscribe token", () => {
    expect(verifyUnsubscribeToken("s3cret", "bUBleC5jb20.bad")).toBeUndefined();
    expect(verifyUnsubscribeToken("s3cret", "nope")).toBeUndefined();
  });

  it("fails with a structured error when Resend refuses", async () => {
    send.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });
    const mail = createMailer({
      apiKey: "re_test",
      from: "x <x@wovain.com>",
      replyTo: "support@wovain.com",
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
