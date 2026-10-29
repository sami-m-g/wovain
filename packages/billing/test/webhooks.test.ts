import type { PolarCore } from "@polar-sh/sdk/2026-10";
import type { Database } from "@wovain/db";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { POLAR_METADATA_KEY } from "../src/plans";
import { createTestDb } from "../src/testing";
import { handlePolarEvent } from "../src/webhooks";

// A grant for a customer that no user owns brings no credits, and says so at
// error level instead of being skipped in silence.

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ close, db } = await createTestDb());
});

afterAll(async () => {
  await close();
});

it("reports a grant to an unknown user through the error log", async () => {
  const error = vi.fn();
  const outcome = await handlePolarEvent(
    {
      db,
      log: { error, set: vi.fn() },
      polar: {} as PolarCore,
    },
    {
      data: {
        benefit: {
          metadata: { [POLAR_METADATA_KEY]: "pack" },
          properties: { rollover: false },
          type: "meter_credit",
        },
        customer: { external_id: "ghost-user" },
        id: "grant_1",
      },
      type: "benefit_grant.created",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a minimal payload
    } as unknown as Parameters<typeof handlePolarEvent>[1]
  );
  expect(outcome).toBe("skipped");
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({
      billing: { grantId: "grant_1", userId: "ghost-user" },
      error: expect.objectContaining({ code: "POLAR_GRANT_UNKNOWN_USER" }),
    })
  );
});
