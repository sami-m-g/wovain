import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { createSealer } from "@wovain/core/sealing";
import { openProposal } from "@wovain/core/voice";
import type { Transcript, VoiceReply } from "@wovain/core/voice";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { design, idea, run } from "@wovain/db/schema/seller";
import { voiceCommand } from "@wovain/db/schema/voice";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "./actor";
import {
  claimVoiceCommand,
  confirmVoiceProposal,
  openVoiceProposal,
  proposeVoiceCommand,
} from "./voice";

// Voice commands on real Postgres (PGlite, with the app's migrations): the
// context comes from the merchant's own rows, the proposal is sealed for
// them, and analytics never sees the words.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const OTHER_ID = "user_2";
const clip = { audio: "UklGRg==", mimeType: "audio/webm" };
const sealer = createSealer(randomBytes(32).toString("base64"));

const empty: VoiceReply = {
  approval: null,
  brief: null,
  design: null,
  ideas: null,
  kind: "none",
  reason: null,
};

interface Captured {
  event: string;
  properties?: Record<string, unknown>;
}

let db: Database;
let runId: string;
let otherRunId: string;

const actorWith = ({
  flags = { "autonomy-approvals": false, "voice-input": true },
  heard = { fallback: false, model: "asr", text: "approve the first two" },
  reply = empty,
  userId = USER_ID,
}: {
  flags?: Record<string, boolean>;
  heard?: Transcript;
  reply?: VoiceReply;
  userId?: string;
} = {}) => {
  const captured: Captured[] = [];
  const prompts: string[] = [];
  const actor = {
    analytics: {
      capture: (event: Captured) => {
        captured.push(event);
        return Promise.resolve();
      },
    },
    core: {
      flags: { isOn: (name: string) => Promise.resolve(flags[name] ?? false) },
      nemotron: ({ prompt }: { prompt: string }) => {
        prompts.push(prompt);
        return Promise.resolve(reply);
      },
      sealer,
      transcriber: { transcribe: () => Promise.resolve(heard) },
    },
    db,
    userId,
  } as unknown as Actor;
  return { actor, captured, prompts };
};

beforeAll(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, relations });
  await migrate(pg, { migrationsFolder: MIGRATIONS });
  db = pg as unknown as Database;
  await db.insert(user).values([
    { email: "a@example.com", emailVerified: true, id: USER_ID, name: "A" },
    { email: "b@example.com", emailVerified: true, id: OTHER_ID, name: "B" },
  ]);
  const [mine] = await db
    .insert(run)
    .values({ seed: "anime", userId: USER_ID })
    .returning();
  const [theirs] = await db
    .insert(run)
    .values({ seed: "cats", userId: OTHER_ID })
    .returning();
  if (mine === undefined || theirs === undefined) {
    throw new Error("runs weren't saved");
  }
  runId = mine.id;
  otherRunId = theirs.id;
  const ideas = await db
    .insert(idea)
    .values(
      ["90s anime", "Y2K racing", "Cottagecore"].map((theme, index) => ({
        avoidNames: [],
        rank: index + 1,
        research: { theme } as never,
        runId,
        score: 80 - index,
        seed: "anime",
        theme,
        userId: USER_ID,
      }))
    )
    .returning();
  await db.insert(design).values({
    artworkHeight: 1,
    artworkUrl: "https://example.com/a.png",
    artworkWidth: 1,
    brief: { title: "Anime Tee" } as never,
    ideaId: ideas[0]?.id ?? "",
    judgment: {} as never,
    runId,
    userId: USER_ID,
  });
});

// Each test starts under the rate limit.
beforeEach(async () => {
  await db.delete(voiceCommand);
});

describe("proposeVoiceCommand", () => {
  it("resolves ordinals against the run's ideas and seals the proposal", async () => {
    const { actor, captured, prompts } = actorWith({
      reply: { ...empty, ideas: [1, 2], kind: "approve_ideas" },
    });
    const command = await proposeVoiceCommand(actor, {
      ...clip,
      runId,
      screen: "run",
    });
    expect(command.transcript).toBe("approve the first two");
    expect(command.proposal).toMatchObject({
      kind: "approve_ideas",
      labels: ["90s anime", "Y2K racing"],
      runId,
    });
    expect(prompts[0]).toContain("DESIGNS:\n1. Anime Tee");
    expect(openProposal(sealer, USER_ID, command.token ?? "").proposal).toEqual(
      command.proposal
    );
    expect(captured).toEqual([
      {
        distinctId: USER_ID,
        event: "voice_command_proposed",
        properties: {
          fallback: false,
          intent: "approve_ideas",
          model: "asr",
          screen: "run",
        },
      },
    ]);
    expect(JSON.stringify(captured)).not.toContain("first two");
  });

  it("starts a drop from any screen", async () => {
    const { actor } = actorWith({
      heard: { fallback: true, model: "wizper", text: "make a drop for cats" },
      reply: { ...empty, brief: "cats", kind: "start_drop" },
    });
    const command = await proposeVoiceCommand(actor, {
      ...clip,
      screen: "home",
    });
    expect(command.proposal).toEqual({ brief: "cats", kind: "start_drop" });
    expect(command.token).toBeTypeOf("string");
  });

  it("asks again when nothing was heard, without calling the model", async () => {
    const { actor, prompts } = actorWith({
      heard: { fallback: true, model: "wizper", text: "" },
    });
    const command = await proposeVoiceCommand(actor, {
      ...clip,
      screen: "home",
    });
    expect(command.proposal).toEqual({ code: "not_heard", kind: "none" });
    expect(command.token).toBeUndefined();
    expect(prompts).toHaveLength(0);
  });

  it("refuses another merchant's run", async () => {
    const { actor } = actorWith();
    await expect(
      proposeVoiceCommand(actor, { ...clip, runId: otherRunId, screen: "run" })
    ).rejects.toThrow(/No run/u);
  });

  it("is off without the voice-input flag", async () => {
    const { actor } = actorWith({ flags: {} });
    await expect(
      proposeVoiceCommand(actor, { ...clip, screen: "home" })
    ).rejects.toThrow(/aren't available/u);
  });
});

describe("openVoiceProposal", () => {
  it("won't open another merchant's proposal", async () => {
    const { actor } = actorWith({
      reply: { ...empty, brief: "cats", kind: "start_drop" },
    });
    const { token } = await proposeVoiceCommand(actor, {
      ...clip,
      screen: "home",
    });
    const other = actorWith({ userId: OTHER_ID }).actor;
    expect(() => openVoiceProposal(other, token ?? "")).toThrow(
      /can't be confirmed/u
    );
    expect(openVoiceProposal(actor, token ?? "").proposal).toEqual({
      brief: "cats",
      kind: "start_drop",
    });
  });
});

describe("confirmVoiceProposal", () => {
  it("returns the proposal once, and refuses a replayed token", async () => {
    const { actor } = actorWith({
      reply: { ...empty, brief: "cats", kind: "start_drop" },
    });
    const { token } = await proposeVoiceCommand(actor, {
      ...clip,
      screen: "home",
    });
    const confirms = await Promise.allSettled([
      confirmVoiceProposal(actor, token ?? ""),
      confirmVoiceProposal(actor, token ?? ""),
    ]);
    expect(confirms.filter((c) => c.status === "fulfilled")).toEqual([
      { status: "fulfilled", value: { brief: "cats", kind: "start_drop" } },
    ]);
    await expect(
      confirmVoiceProposal(actor, token ?? "")
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("claimVoiceCommand", () => {
  it("refuses a merchant past the per-minute limit, before any paid call", async () => {
    const { actor } = actorWith({ userId: OTHER_ID });
    const now = new Date();
    await Promise.all(
      Array.from({ length: 6 }, () => claimVoiceCommand(actor, now))
    );
    await expect(claimVoiceCommand(actor, now)).rejects.toMatchObject({
      status: 429,
    });
    // A minute later the merchant may talk again.
    await expect(
      claimVoiceCommand(actor, new Date(now.getTime() + 61_000))
    ).resolves.toBeTypeOf("string");
  });

  it("caps a merchant at an hour's limit too", async () => {
    const { actor } = actorWith({ userId: OTHER_ID });
    const start = Date.now();
    // 60 commands over the last 50 minutes, none in the last minute.
    await db.insert(voiceCommand).values(
      Array.from({ length: 60 }, (_, sent) => ({
        createdAt: new Date(start - (sent + 2) * 50_000),
        userId: OTHER_ID,
      }))
    );
    await expect(
      claimVoiceCommand(actor, new Date(start))
    ).rejects.toMatchObject({ status: 429 });
  });
});
