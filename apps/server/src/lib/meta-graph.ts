import type { MetaRule } from "@wovain/shared/rules";
import { z } from "zod";

import { fetchJson } from "./fetch-json.ts";

// The one thing the Meta Ads MCP can't do: automated rules
// (developers.facebook.com/docs/marketing-api/ad-rules). Pinned to v26.0.
const GRAPH = "https://graph.facebook.com/v26.0";

const listSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string() })),
});
const createdSchema = z.object({ id: z.string() });

const meta = { label: "Meta", timeoutMs: 20_000 };

export const createMetaGraph = (token: string, adAccountId: string) => {
  const account = `${GRAPH}/act_${adAccountId.replace(/^act_/u, "")}`;
  const auth = { authorization: `Bearer ${token}` };
  return {
    createRule: async ({ label: _label, ...rule }: MetaRule) => {
      const form = new URLSearchParams({
        evaluation_spec: JSON.stringify(rule.evaluation_spec),
        execution_spec: JSON.stringify(rule.execution_spec),
        name: rule.name,
        schedule_spec: JSON.stringify(rule.schedule_spec),
      });
      const created = await fetchJson(
        `${account}/adrules_library`,
        createdSchema,
        { ...meta, body: form, headers: auth, method: "POST" }
      );
      return created.id;
    },
    listRuleNames: async () => {
      const url = new URL(`${account}/adrules_library`);
      url.searchParams.set("fields", "name");
      url.searchParams.set("limit", "200");
      const list = await fetchJson(url, listSchema, { ...meta, headers: auth });
      return list.data.map((rule) => rule.name);
    },
  };
};
