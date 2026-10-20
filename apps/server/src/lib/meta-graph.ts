import type { MetaRule } from "@wovain/shared/rules";
import { z } from "zod";

// The one thing the Meta Ads MCP can't do: automated rules
// (developers.facebook.com/docs/marketing-api/ad-rules). Pinned to v26.0.
const GRAPH = "https://graph.facebook.com/v26.0";

const errorSchema = z.object({
  error: z.object({ message: z.string() }),
});
const listSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string() })),
});
const createdSchema = z.object({ id: z.string() });

const call = async (url: URL, init: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new Error(
      `Meta answered ${response.status}${parsed.success ? `: ${parsed.data.error.message}` : ""}`
    );
  }
  return body;
};

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
      const body = await call(new URL(`${account}/adrules_library`), {
        body: form,
        headers: auth,
        method: "POST",
      });
      return createdSchema.parse(body).id;
    },
    listRuleNames: async () => {
      const url = new URL(`${account}/adrules_library`);
      url.searchParams.set("fields", "name");
      url.searchParams.set("limit", "200");
      const body = await call(url, { headers: auth });
      return listSchema.parse(body).data.map((rule) => rule.name);
    },
  };
};
