// Runs the whole program against mocks, with no cloud credentials: missing
// config, code that throws and dynamic providers that
// don't serialize fail here, on every pull request, instead of in `pulumi up`.
import { readFileSync } from "node:fs";

import * as pulumi from "@pulumi/pulumi";
import { expect, test } from "vitest";
import { parse } from "yaml";

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

const calls: Record<string, Record<string, unknown>> = {
  "gcp:organizations/getProject:getProject": {
    billingAccount: "000000-000000-000000",
    number: "123456789",
  },
  "gcp:siteverification/getToken:getToken": { token: "verification" },
};

const registered: string[] = [];
await pulumi.runtime.setMocks(
  {
    call: ({ inputs, token }) => calls[token] ?? inputs,
    newResource: ({ inputs, name, type }) => {
      registered.push(`${type}::${name}`);
      // Outputs the program reads that only the provider computes.
      return {
        id: `${name}-id`,
        state: {
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
  // GitHub is the primary repository: its main ruleset, the production
  // environment and the Actions variables deploy.yml reads.
  for (const urn of [
    "github:index/repositoryRuleset:RepositoryRuleset::main",
    "github:index/repositoryEnvironment:RepositoryEnvironment::production",
    "github:index/actionsVariable:ActionsVariable::GCP_WORKLOAD_IDENTITY_PROVIDER",
    "github:index/actionsVariable:ActionsVariable::GCP_DEPLOY_SERVICE_ACCOUNT",
    "gcp:serviceaccount/iAMMember:IAMMember::deployer-from-github",
  ]) {
    expect(registered).toContain(urn);
  }
  // Nothing GitLab is left: the project is read-only, so Pulumi must never
  // plan a change to it (infra/README.md, "Leaving GitLab").
  expect(
    registered.filter(
      (r) => r.startsWith("gitlab:") || r.startsWith("graphql:")
    )
  ).toEqual([]);
  // Two resources with one type and name are one URN, which the engine refuses.
  expect(registered.filter((r, i) => registered.indexOf(r) !== i)).toEqual([]);

  // PostHog: the health dashboard, a flag per registry entry and an insight
  // and alert per KPI.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generated JSON
  const flags = JSON.parse(read("posthog/flags.json")) as {
    flags: Record<string, unknown>;
  };
  for (const key of Object.keys(flags.flags)) {
    expect(registered).toContain(
      `posthog:index/featureFlag:FeatureFlag::flag-${key}`
    );
  }
  expect(registered).toContain("posthog:index/dashboard:Dashboard::health");
  expect(registered).toContain("posthog:index/alert:Alert::kpi-field-lcp");
});

test("every PostHog object to adopt is one the program declares", () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- pulumi import's file format
  const { resources } = JSON.parse(read("posthog/import.json")) as {
    resources: { id: string; name: string; type: string }[];
  };
  expect(resources.length).toBeGreaterThan(0);
  for (const { name, type } of resources) {
    expect(registered).toContain(`${type}::${name}`);
  }
});

test("retired and frozen resources match what the program declares", async () => {
  const { RETIRED } = await import("./policy/retired.ts");
  for (const [key, release] of Object.entries(RETIRED)) {
    const [project, ...rest] = key.split("::");
    if (project !== "wovain") {
      continue;
    }
    // Released in code: declared, so an `up` writes its flags. Released by
    // `pulumi state unprotect`: not declared, so that `up` deletes it.
    expect(registered.includes(rest.join("::"))).toBe(release === "code");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- our own file
  const freeze = JSON.parse(read("freeze.json")) as { resources: string[] };
  for (const key of freeze.resources) {
    expect(registered).toContain(key.replace(/^wovain::/u, ""));
  }
});
