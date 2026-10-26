import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGoogle } from "../src/google.ts";

// Bad credentials must reject the call, not crash the job: the generated
// clients sign in without awaiting it, and vitest fails the run on the
// unhandled rejection that leaks when they are not signed in first. Nothing
// reaches the network: reading the credential file fails first.

const range = { end: new Date(), start: new Date(Date.now() - 60 * 60 * 1000) };
const missingFile = /Unable to read the credential file/u;

beforeEach(() => {
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/nonexistent/credentials.json");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createGoogle with a missing credential file", () => {
  it("rejects entries", async () => {
    const google = createGoogle("wovain-test");
    await expect(google.entries("severity>=ERROR", range)).rejects.toThrow(
      missingFile
    );
  });

  it("rejects metric", async () => {
    const google = createGoogle("wovain-test");
    await expect(
      google.metric(
        {
          aligner: "ALIGN_SUM",
          filter: 'metric.type="run.googleapis.com/request_count"',
          reducer: "REDUCE_SUM",
        },
        range
      )
    ).rejects.toThrow(missingFile);
  });
});
