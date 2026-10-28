import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { createMockModel } from "@mastra/core/test-utils/llm-mock";
import { writeAdCopy } from "@wovain/core/ads";
import type { AgentKit } from "@wovain/core/agents";
import { createModelRouter } from "@wovain/core/model-router";
import { createNemotron } from "@wovain/core/nemotron";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { decisionTrace } from "@wovain/db/schema/autonomy";
import { run } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import type { Actor } from "./actor";
import { withAgentTrace } from "./agent-trace";
import { modelTrace } from "./model-trace";

// With model-routing on, every agent call of a run is saved to its decision
// trace and read back as "which model did what". Real Postgres (PGlite,
// with the app's migrations), a mock Nemotron.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const RUN_ID = "run_1";

const models = createModelRouter({
  NEMOTRON_MODEL_DEFAULT: "m-default",
  NEMOTRON_MODEL_FAST: "m-fast",
  NEMOTRON_MODEL_REASONING: "m-reasoning",
  NEMOTRON_MODEL_SAFETY: "m-safety",
  NEMOTRON_MODEL_VISION: "m-vision",
});

const variants = [
  { angle: "humor", headline: "Moths love it", message: "A moth tee." },
  { angle: "gift", headline: "Gift a moth", message: "For moth people." },
];

const nemotron = createNemotron({
  agents: {
    ad_copy: new Agent({
      id: "ad_copy",
      instructions: "Answer with JSON only.",
      model: createMockModel({
        mockText: { variants },
        version: "v2",
      }) as MastraModelConfig,
      name: "ad_copy",
    }),
  },
  modelFor: (_id: string, routed: boolean) =>
    routed ? models.modelFor("default") : "m-legacy",
} as unknown as AgentKit);

const setup = async (routed: boolean) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  await db.insert(run).values({ id: RUN_ID, seed: "moths", userId: USER_ID });
  const actor = {
    core: {
      flags: { isOn: () => Promise.resolve(routed) },
      models,
      nemotron,
    },
    db: db as unknown as Database,
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db };
};

const writeCopy = async (actor: Actor) =>
  await withAgentTrace(
    actor,
    { runId: RUN_ID, traceId: RUN_ID },
    async () =>
      await writeAdCopy(actor.core.nemotron, {
        description: "Two lines.",
        idea: "moths",
        title: "Moth tee",
      })
  );

describe("model trace", () => {
  it("saves each routed call and shows which model did what", async () => {
    const { actor } = await setup(true);
    await expect(writeCopy(actor)).resolves.toEqual(variants);

    const shown = await modelTrace(actor);
    expect(shown.run?.id).toBe(RUN_ID);
    expect(shown.models.reasoning).toBe("m-reasoning");
    expect(
      shown.entries.map((entry) => [entry.agent, entry.role, entry.model])
    ).toEqual([
      ["ad_copy", "default", "m-default"],
      ["grounding_guard", null, null],
    ]);
  });

  it("saves nothing and hides the trace while the flag is off", async () => {
    const { actor, db } = await setup(false);
    await expect(writeCopy(actor)).resolves.toEqual(variants);
    expect(await db.select().from(decisionTrace)).toEqual([]);
    await expect(modelTrace(actor)).rejects.toThrow(
      "The model trace isn't available yet"
    );
  });
});
