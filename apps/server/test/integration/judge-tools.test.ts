import { judgeResultSchema } from "@wovain/shared/judge";
import { genkit } from "genkit";
import { mockModel } from "genkit/testing";
import { expect, test } from "vitest";

import { createDesignJudge } from "../../src/lib/design-judge.ts";
import {
  connectClient,
  demoBrief,
  passingReply,
  testStore,
} from "../helpers.ts";

const judgeWith = (respond: Parameters<typeof mockModel>[1]) => {
  const ai = genkit({});
  mockModel(ai, respond);
  return createDesignJudge(ai, "mockModel");
};

const callJudge = async (judge?: ReturnType<typeof judgeWith>) => {
  const client = await connectClient({}, testStore(), judge);
  const result = await client.callTool({
    arguments: demoBrief,
    name: "judge_design",
  });
  await client.close();
  return result;
};

test("judge_design without a Nebius key says to skip the check", async () => {
  const result = await callJudge();
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toStrictEqual({ configured: false });
  expect(JSON.stringify(result.content)).toContain("NEBIUS_API_KEY");
});

test("judge_design returns the judgment over MCP", async () => {
  const result = await callJudge(
    judgeWith({ respond: { text: JSON.stringify(passingReply) } })
  );
  expect(result.isError).toBeFalsy();
  const { configured, judgment } = judgeResultSchema.parse(
    result.structuredContent
  );
  expect(configured).toBe(true);
  expect(judgment?.verdict).toBe("ready");
  expect(judgment?.checks).toHaveLength(6);
});

test("judge_design turns a model failure into a user-safe error", async () => {
  const result = await callJudge(
    judgeWith({ respond: [new Error("upstream 503: secret details")] })
  );
  expect(result.isError).toBe(true);
  const message = JSON.stringify(result.content);
  expect(message).toContain("show the widget without it");
  expect(message).not.toContain("secret details");
});
