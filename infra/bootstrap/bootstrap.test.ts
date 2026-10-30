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
// Bucket grants' conditions, by resource name.
const bucketConditions = new Map<string, string | undefined>();
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
      if (type === "gcp:storage/bucketIAMMember:BucketIAMMember") {
        bucketConditions.set(name, inputs["condition"]?.expression);
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
      // The github stack's `pulumi up` from CI (github.ts).
      "gcp:serviceaccount/account:Account::infra-github",
      "gcp:serviceaccount/iAMMember:IAMMember::infra-github-from-github",
      "gcp:kms/cryptoKey:CryptoKey::github-stack-secrets",
      "gcp:kms/cryptoKeyIAMMember:CryptoKeyIAMMember::infra-preview-github-stack-secrets",
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
  ).toEqual([
    "roles/browser",
    "roles/run.viewer",
    "roles/serviceusage.serviceUsageConsumer",
  ]);
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

test("infra-next reads and writes only next's state, its locks included", () => {
  const expression = bucketConditions.get("infra-next-state") ?? "";
  const objects = "projects/_/buckets/wovain-pulumi-state/objects/.pulumi";
  // Where Pulumi's GCS backend keeps the next stack: its locks sit under
  // the stack's fully qualified name (`pulumi up` 403'd there before).
  for (const prefix of [
    "stacks/wovain-next/",
    "locks/organization/wovain-next/",
    "history/wovain-next/",
    "backups/wovain-next/",
  ]) {
    expect(expression).toContain(`startsWith("${objects}/${prefix}")`);
  }
  // Nothing of production's or bootstrap's.
  expect(expression).not.toMatch(/\/wovain\/|wovain-bootstrap/u);
});

test("infra-github has no Google role but its stack's state and key", () => {
  expect(
    projectRoles.filter(({ name }) => name.startsWith("infra-github"))
  ).toEqual([]);
  const expression = bucketConditions.get("infra-github-state") ?? "";
  const objects = "projects/_/buckets/wovain-pulumi-state/objects/.pulumi";
  for (const prefix of [
    "stacks/wovain-github/",
    "locks/organization/wovain-github/",
    "history/wovain-github/",
    "backups/wovain-github/",
  ]) {
    expect(expression).toContain(`startsWith("${objects}/${prefix}")`);
  }
  expect(expression).not.toMatch(/\/wovain\/|wovain-bootstrap|wovain-next/u);
  // Trusted only from its own GitHub environment.
  expect(
    workloadUsers.filter((member) => member.endsWith("/github-infrastructure"))
  ).toHaveLength(1);
});
