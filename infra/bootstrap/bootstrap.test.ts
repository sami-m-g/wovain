// The bootstrap program against mocks, like ../program.test.ts. Its resource
// names must match the ones `pulumi state move` brings over from infra/.
import { readFileSync } from "node:fs";

import * as pulumi from "@pulumi/pulumi";
import { expect, test } from "vitest";
import { parse } from "yaml";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
const { config } = parse(
  readFileSync(new URL("Pulumi.prod.yaml", import.meta.url), "utf-8")
) as { config: Record<string, string> };
pulumi.runtime.setAllConfig(config);

const registered: string[] = [];
// Project role grants, and who may act as an account.
const projectRoles: { condition?: string; name: string; role: string }[] = [];
const workloadUsers: string[] = [];
await pulumi.runtime.setMocks(
  {
    call: ({ inputs }) => ({
      ...inputs,
      billingAccount: "000000-000000-000000",
      number: "123456789",
    }),
    newResource: ({ inputs, name, type }) => {
      registered.push(`${type}::${name}`);
      if (type === "gcp:projects/iAMMember:IAMMember") {
        projectRoles.push({
          condition: inputs["condition"]?.expression,
          name,
          role: inputs["role"],
        });
      }
      if (inputs["role"] === "roles/iam.workloadIdentityUser") {
        workloadUsers.push(inputs["member"]);
      }
      return { id: `${name}-id`, state: inputs };
    },
  },
  "wovain-bootstrap",
  "prod",
  false
);

test("the bootstrap program registers CI's identities", async () => {
  await import("./index.ts");
  await pulumi.runtime.disconnect();
  expect(registered).toEqual(
    expect.arrayContaining([
      "gcp:serviceaccount/account:Account::gitlab-infra",
      "gcp:iam/workloadIdentityPool:WorkloadIdentityPool::github",
      "gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::github",
      "gcp:serviceaccount/iAMMember:IAMMember::infra-from-github",
      "gcp:projects/iAMMember:IAMMember::infra-editor",
      "gcp:billing/accountIamMember:AccountIamMember::infra-budgets",
      // The state bucket and stack secrets key, adopted (state.ts).
      "gcp:storage/bucket:Bucket::pulumi-state",
      "gcp:kms/cryptoKey:CryptoKey::stack-secrets",
      // Pull request previews (preview.ts).
      "gcp:iam/workloadIdentityPool:WorkloadIdentityPool::github-pull-requests",
      "gcp:serviceaccount/account:Account::infra-preview",
      // next's `pulumi up` from CI (next.ts).
      "gcp:serviceaccount/account:Account::infra-next",
      "gcp:serviceaccount/iAMMember:IAMMember::infra-next-from-github",
      "gcp:kms/cryptoKey:CryptoKey::next-stack-secrets",
      "gcp:kms/cryptoKeyIAMMember:CryptoKeyIAMMember::infra-preview-next-stack-secrets",
    ])
  );
});

test("infra-next has no project role that reaches production", () => {
  const nextRoles = projectRoles.filter(({ name }) =>
    name.startsWith("infra-next-")
  );
  expect(
    nextRoles
      .filter(({ condition }) => condition === undefined)
      .map(({ role }) => role)
      .toSorted()
  ).toEqual(["roles/browser", "roles/serviceusage.serviceUsageConsumer"]);
  for (const { condition } of nextRoles) {
    if (condition !== undefined) {
      expect(condition).toMatch(/next|modifiedGrantsByRole/u);
    }
  }
  expect(nextRoles.map(({ role }) => role)).not.toContain("roles/editor");
  // Trusted only from its own GitHub environment.
  expect(
    workloadUsers.filter((member) => member.endsWith("/next-infrastructure"))
  ).toHaveLength(1);
});
