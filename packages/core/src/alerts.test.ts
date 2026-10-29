import { describe, expect, it } from "vitest";

import {
  alertSettingsOf,
  alertSettingsSchema,
  alertTypeOf,
  DEFAULT_ALERT_CHANNELS,
  planAlert,
  quietUntil,
} from "./alerts";

const night = { end: "07:00", start: "22:00", timeZone: "Africa/Cairo" };

describe("alert settings", () => {
  it("fills the defaults for types the merchant never set", () => {
    const settings = alertSettingsOf({
      channels: { updates: ["email", "email"] },
    });
    expect(settings.channels.updates).toEqual(["email"]);
    expect(settings.channels.rule_action).toEqual(
      DEFAULT_ALERT_CHANNELS.rule_action
    );
    expect(settings.quietHours).toBeNull();
  });

  it("ignores a stored value that no longer parses", () => {
    expect(alertSettingsOf("nonsense").channels).toEqual(
      DEFAULT_ALERT_CHANNELS
    );
    expect(
      alertSettingsOf({ quietHours: { ...night, timeZone: "Mars/Olympus" } })
        .quietHours
    ).toBeNull();
  });

  it("refuses an unknown time zone or a malformed time", () => {
    const channels = DEFAULT_ALERT_CHANNELS;
    expect(
      alertSettingsSchema.safeParse({
        channels,
        quietHours: { ...night, timeZone: "Nowhere/City" },
      }).success
    ).toBe(false);
    expect(
      alertSettingsSchema.safeParse({
        channels,
        quietHours: { ...night, start: "24:00" },
      }).success
    ).toBe(false);
  });

  it("maps every notify kind to an alert type", () => {
    expect(alertTypeOf("anomaly")).toBe("rule_action");
    expect(alertTypeOf("run_failed")).toBe("failure");
    expect(alertTypeOf("order")).toBe("first_sale");
    expect(alertTypeOf("suggestion")).toBe("updates");
  });
});

describe("quiet hours", () => {
  // Cairo is UTC+2 in late October 2026 (after its summer time ends).
  it("holds until the end of quiet hours that span midnight", () => {
    const at = new Date("2026-10-30T21:30:15Z");
    expect(quietUntil(at, night)?.toISOString()).toBe(
      "2026-10-31T05:00:00.000Z"
    );
  });

  it("ends at the local time across a clock change", () => {
    // Paris leaves summer time at 03:00 on 2026-10-25: 07:00 is then 06:00Z.
    const paris = { ...night, timeZone: "Europe/Paris" };
    expect(
      quietUntil(new Date("2026-10-24T22:00:00Z"), paris)?.toISOString()
    ).toBe("2026-10-25T06:00:00.000Z");
  });

  it("ends after the gap when the end time doesn't exist that night", () => {
    // Paris skips 02:00-03:00 on 2026-03-29; quiet hours end at 02:30.
    const paris = { end: "02:30", start: "22:00", timeZone: "Europe/Paris" };
    const until = quietUntil(new Date("2026-03-29T00:45:00Z"), paris);
    expect(until?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("is open outside them, or with none set", () => {
    const noon = new Date("2026-10-30T10:00:00Z");
    expect(quietUntil(noon, night)).toBeUndefined();
    expect(quietUntil(noon, null)).toBeUndefined();
    expect(
      quietUntil(noon, { ...night, end: "22:00", start: "22:00" })
    ).toBeUndefined();
  });

  it("holds push and Telegram, never email", () => {
    const at = new Date("2026-10-30T23:00:00Z");
    const plan = planAlert(
      "anomaly",
      alertSettingsOf({ quietHours: night }),
      at
    );
    const held = Object.fromEntries(
      plan.map((item) => [item.channel, item.holdUntil?.toISOString()])
    );
    expect(held).toEqual({
      email: undefined,
      push: "2026-10-31T05:00:00.000Z",
      telegram: "2026-10-31T05:00:00.000Z",
    });
  });

  it("sends only to the channels picked for the type", () => {
    const settings = alertSettingsOf({
      channels: { first_sale: ["telegram"] },
    });
    expect(
      planAlert("first_sale", settings, new Date()).map((item) => item.channel)
    ).toEqual(["telegram"]);
  });
});
