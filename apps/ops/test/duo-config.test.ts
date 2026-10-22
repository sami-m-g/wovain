import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

// The Duo scout flow runs unattended, so nothing a person or an event can
// write may reach its prompt or start it (infra/Pulumi.prod.yaml,
// .gitlab/duo/catalog/flows/scout.yml).

const read = (path: string): unknown =>
  parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf-8"));

const rule = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.array(z.unknown()),
});
const stack = z.object({
  config: z.object({
    "wovain:duoCustomFlows": z.array(
      z.object({
        events: z.array(z.string()),
        file: z.string(),
        filter: z
          .object({
            pipeline_hooks: z.object({
              match: z.string(),
              rules: z.array(rule),
            }),
          })
          .optional(),
        name: z.string(),
      })
    ),
  }),
});
const flow = z.object({
  definition: z.object({
    prompts: z.array(
      z.object({
        prompt_template: z.object({ system: z.string(), user: z.string() }),
      })
    ),
  }),
});

const customFlows = stack.parse(read("infra/Pulumi.prod.yaml")).config[
  "wovain:duoCustomFlows"
];

describe("custom Duo flows", () => {
  it("start only on events no comment can cause", () => {
    for (const f of customFlows) {
      expect(f.events).toStrictEqual(["pipeline_hooks"]);
    }
  });

  it("limit the scout to a successful child pipeline on main", () => {
    const scout = customFlows.find((f) => f.name === "duo-scout");
    expect(scout?.filter?.pipeline_hooks.match).toBe("all");
    expect(scout?.filter?.pipeline_hooks.rules).toStrictEqual([
      { field: "object_attributes.status", operator: "in", value: ["success"] },
      {
        field: "object_attributes.default_branch",
        operator: "in",
        value: [true],
      },
      {
        field: "object_attributes.source",
        operator: "in",
        value: ["parent_pipeline"],
      },
    ]);
  });

  it("give every flow fixed prompts with no event input", () => {
    for (const f of customFlows) {
      for (const p of flow.parse(read(f.file)).definition.prompts) {
        expect(p.prompt_template.user).not.toMatch(/\{\{/u);
        expect(p.prompt_template.system).not.toMatch(/\{\{/u);
      }
    }
  });

  it("keep the scout's issues confidential", () => {
    const [prompt] = flow.parse(read(".gitlab/duo/catalog/flows/scout.yml"))
      .definition.prompts;
    expect(prompt?.prompt_template.system).toContain("confidential: true");
  });
});
