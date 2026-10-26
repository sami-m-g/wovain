// Runs the whole program against mocks, with no cloud credentials: missing
// config, code that throws, unknown Duo names and dynamic providers that
// don't serialize fail here, on every merge request, instead of in `pulumi up`.
import { readFileSync } from "node:fs";

import * as pulumi from "@pulumi/pulumi";
import { expect, test } from "vitest";
import { parse } from "yaml";

interface Trigger {
  flow: string;
  serviceAccount: string;
}

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf-8");
const isSecure = (value: unknown) =>
  typeof value === "object" && value !== null && "secure" in value;

// The real stack config. Secrets are ciphertext in the file and the program
// only needs a value; the opt-in features are on, so their code runs too.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
const { config } = parse(read("Pulumi.prod.yaml")) as {
  config: Record<string, unknown>;
};
const values: Record<string, string> = {
  "wovain:posthogTrigger": "true",
  "wovain:resendDomain": "true",
};
for (const [key, value] of Object.entries(config)) {
  if (isSecure(value)) {
    values[key] = "placeholder";
  } else {
    values[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
}
pulumi.runtime.setAllConfig(
  values,
  Object.keys(config).filter((key) => isSecure(config[key]))
);

// One GraphQL answer fits both of duo.ts's lookups: every configured service
// account and flow, and every synced custom item, exists.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked by duo.ts
const triggers = config["wovain:duoTriggers"] as Trigger[];
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- written by the ai-catalog component
const mapping = JSON.parse(
  read("../.gitlab/duo/catalog/mapping.json")
) as Record<string, Record<string, { catalog_id: string }>>;
const items = [
  ...triggers.map((t) => t.flow),
  ...Object.values(mapping).flatMap((group) =>
    Object.values(group).map((item) => item.catalog_id)
  ),
];
const graphqlData = {
  aiCatalogConfiguredItems: {
    nodes: items.map((ref) => ({
      id: `consumer-${ref}`,
      item: { foundationalFlowReference: ref, id: ref },
    })),
  },
  project: {
    aiFlowTriggers: {
      nodes: [{ user: { username: "ai-wovain-heal-gitlab-ai-hackathon" } }],
    },
    id: "gid://gitlab/Project/1",
  },
  users: {
    nodes: triggers.map((t) => ({
      id: t.serviceAccount,
      username: t.serviceAccount,
    })),
  },
};
const calls: Record<string, Record<string, unknown>> = {
  "gcp:organizations/getProject:getProject": {
    billingAccount: "000000-000000-000000",
    number: "123456789",
  },
  "gcp:siteverification/getToken:getToken": { token: "verification" },
  "graphql:index/getQuery:getQuery": {
    queryResponse: JSON.stringify({ data: graphqlData }),
  },
};

const registered: string[] = [];
// Each feature flag's strategy parameters, as GitLab's API receives them.
const flagParameters: Record<string, unknown>[] = [];
await pulumi.runtime.setMocks(
  {
    call: ({ inputs, token }) => calls[token] ?? inputs,
    newResource: ({ inputs, name, type }) => {
      registered.push(`${type}::${name}`);
      if (type === "gitlab:index/projectFeatureFlag:ProjectFeatureFlag") {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider's input shape
        const strategies = (inputs["strategies"] ?? []) as {
          parameters?: Record<string, unknown>;
        }[];
        for (const { parameters } of strategies) {
          if (parameters !== undefined) {
            flagParameters.push(parameters);
          }
        }
      }
      // Outputs the program reads that only the provider computes.
      return {
        id: `${name}-id`,
        state: {
          // What a graphql.Mutation computes from its create response.
          computedReadOperationVariables: { id: `${name}-id` },
          privateKeyOpenssh: "private-key",
          publicKeyOpenssh: "ssh-ed25519 public-key",
          records: [
            {
              name: "send",
              priority: 10,
              type: "MX",
              value: "feedback.example.com",
            },
            { name: "rsend", type: "CNAME", value: "send.forge.example.net" },
          ],
          verificationCode: "code",
          ...inputs,
        },
      };
    },
  },
  "wovain",
  "prod",
  false
);

test("the program registers every resource once, without throwing", async () => {
  await import("./index.ts");
  // Waits for every registration, so an error inside an apply or while
  // serializing a dynamic provider fails the run.
  await pulumi.runtime.disconnect();
  expect(registered).toContain("pulumi-nodejs:dynamic/resend:Domain::resend");
  expect(registered).toContain(
    "gcp:dns/recordSet:RecordSet::rsend-wovain-com-cname"
  );
  expect(registered).toContain(
    "gitlab:index/pipelineTrigger:PipelineTrigger::posthog"
  );
  // Every synced custom flow is enabled, gets its trigger, and its service
  // account reaches the ops job as a CI variable.
  for (const name of ["duo-heal", "duo-scout"]) {
    expect(registered).toContain(
      `graphql:index/mutation:Mutation::${name}-consumer`
    );
    expect(registered).toContain(`graphql:index/mutation:Mutation::${name}`);
  }
  expect(registered).toContain(
    "gitlab:index/projectVariable:ProjectVariable::DUO_HEAL_ACCOUNT"
  );
  // Every flag in the app's registry, and the user list their rollouts use.
  const { FLAG_NAMES } = await import("../packages/core/src/flag-registry.ts");
  for (const name of FLAG_NAMES) {
    expect(registered).toContain(
      `gitlab:index/projectFeatureFlag:ProjectFeatureFlag::flag-${name}`
    );
  }
  expect(registered).toContain(
    "gitlab:index/projectFeatureFlagUserList:ProjectFeatureFlagUserList::internal-only"
  );
  // Two resources with one type and name are one URN, which the engine refuses.
  expect(registered.filter((r, i) => registered.indexOf(r) !== i)).toEqual([]);
});

test("every percent rollout's groupId is one GitLab accepts", () => {
  const groupIds = flagParameters.flatMap((p) => {
    const id = p["groupId"];
    return typeof id === "string" ? [id] : [];
  });
  expect(groupIds.length).toBeGreaterThan(0);
  for (const id of groupIds) {
    expect(id).toMatch(/^[a-z]{1,32}$/u);
  }
});
