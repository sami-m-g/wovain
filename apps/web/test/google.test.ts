import { socialProviders } from "@wovain/auth";
import { describe, expect, it } from "vitest";

describe("Google sign-in", () => {
  it("is configured when both the client ID and secret are set", () => {
    expect(
      socialProviders({
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      })
    ).toEqual({ google: { clientId: "id", clientSecret: "secret" } });
  });

  it("stays off without the secret or without the ID", () => {
    expect(socialProviders({ GOOGLE_CLIENT_ID: "id" })).toEqual({});
    expect(socialProviders({ GOOGLE_CLIENT_SECRET: "secret" })).toEqual({});
    expect(
      socialProviders({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" })
    ).toEqual({});
  });
});
