import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

// The custom flows' definitions, checked against the parts of the Flow
// Registry v1 schema they use (docs: "Custom flow YAML schema"), so a typo
// fails here instead of in the catalog sync. Tool names are the ones GitLab
// documents for agents and flows (docs: "Agent tools").

const TOOLS = new Set([
  "create_file_with_contents",
  "create_issue",
  "create_issue_note",
  "create_merge_request",
  "edit_file",
  "find_files",
  "get_issue",
  "get_repository_file",
  "gitlab_blob_search",
  "gitlab_issue_search",
  "list_dir",
  "list_issue_notes",
  "list_issues",
  "list_repository_tree",
  "mkdir",
  "read_file",
  "run_command",
]);
// Tools that change code or merge requests; the scout flow must have none.
const WRITES_CODE = new Set([
  "create_file_with_contents",
  "create_merge_request",
  "edit_file",
  "mkdir",
  "run_command",
]);

const flowSchema = z.object({
  definition: z.object({
    coding_environment: z.enum(["full", "none"]).optional(),
    components: z.array(
      z.object({
        name: z.string().regex(/^[^:.]+$/u),
        prompt_id: z.string(),
        toolset: z.array(z.string()),
        type: z.literal("AgentComponent"),
      })
    ),
    environment: z.literal("ambient"),
    flow: z.object({ entry_point: z.string() }),
    prompts: z.array(
      z.object({
        prompt_id: z.string(),
        prompt_template: z.object({ system: z.string(), user: z.string() }),
        unit_primitives: z.array(z.string()),
      })
    ),
    routers: z.array(z.object({ from: z.string(), to: z.string() })),
    version: z.literal("v1"),
  }),
  description: z.string(),
  name: z.string(),
  public: z.literal(false),
});

const load = async (name: string) =>
  flowSchema.parse(
    parse(
      await readFile(
        new URL(
          `../../../.gitlab/duo/catalog/flows/${name}.yml`,
          import.meta.url
        ),
        "utf-8"
      )
    )
  );

describe.each(["heal", "release-guard", "scout"])("the %s flow", (name) => {
  it("is a well-formed private ambient flow", async () => {
    const { definition } = await load(name);
    const components = new Set(definition.components.map((c) => c.name));
    const prompts = new Set(definition.prompts.map((p) => p.prompt_id));
    expect(components.has(definition.flow.entry_point)).toBe(true);
    for (const c of definition.components) {
      expect(prompts.has(c.prompt_id)).toBe(true);
      for (const tool of c.toolset) {
        expect(TOOLS.has(tool), tool).toBe(true);
      }
    }
    for (const r of definition.routers) {
      expect(components.has(r.from)).toBe(true);
      expect(r.to === "end" || components.has(r.to)).toBe(true);
    }
  });
});

describe("the scout flow", () => {
  it("can't change code and takes nothing from the event that starts it", async () => {
    const { definition } = await load("scout");
    expect(definition.coding_environment).toBe("none");
    const tools = definition.components.flatMap((c) => c.toolset);
    expect(tools.filter((t) => WRITES_CODE.has(t))).toStrictEqual([]);
    for (const p of definition.prompts) {
      expect(p.prompt_template.user).not.toContain("goal");
    }
  });
});

describe("the heal flow", () => {
  it("copies the signature marker into its MR, which heal:verify reads", async () => {
    const { definition } = await load("heal");
    const [prompt] = definition.prompts;
    expect(prompt?.prompt_template.system).toContain("wovain:signature");
    expect(prompt?.prompt_template.system).toContain('"heal F"');
  });
});

describe("the release-guard flow", () => {
  it("only diagnoses and fixes: it never turns production back on", async () => {
    const { definition } = await load("release-guard");
    const [prompt] = definition.prompts;
    expect(prompt?.prompt_template.system).toContain("wovain:release-guard");
    expect(prompt?.prompt_template.system).toContain("Never re-enable a flag");
  });
});
