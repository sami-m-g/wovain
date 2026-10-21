import { expect, test } from "bun:test";

import { connectClient, testStore } from "./helpers.ts";

test("the server sends the flow and serves each playbook as a tool and a prompt", async () => {
  const client = await connectClient({}, await testStore());
  expect(client.getInstructions()).toContain("get_playbook");

  const result = await client.callTool({
    arguments: { step: "campaign" },
    name: "get_playbook",
  });
  expect(JSON.stringify(result.content)).toContain("create_rules");

  const { prompts } = await client.listPrompts();
  expect(prompts.map((prompt) => prompt.name).toSorted()).toEqual([
    "ads",
    "campaign",
    "design",
  ]);
  const prompt = await client.getPrompt({ name: "design" });
  expect(JSON.stringify(prompt.messages)).toContain("show_design_widget");
});
