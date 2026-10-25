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
pulumi.runtime.setAllConfig({
  ...config,
  "wovain-bootstrap:previewUsers": JSON.stringify(["someone"]),
});

const registered: string[] = [];
await pulumi.runtime.setMocks(
  {
    call: ({ inputs }) => ({
      ...inputs,
      billingAccount: "000000-000000-000000",
    }),
    newResource: ({ inputs, name, type }) => {
      registered.push(`${type}::${name}`);
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
      "gcp:serviceaccount/account:Account::gitlab-preview",
      "gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab",
      "gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab-mr",
      "gcp:projects/iAMMember:IAMMember::infra-editor",
      "gcp:billing/accountIamMember:AccountIamMember::infra-budgets",
    ])
  );
});
