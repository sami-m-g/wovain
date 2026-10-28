// The next.wovain.com program against mocks, like ../program.test.ts.
import { readFileSync } from "node:fs";

import * as pulumi from "@pulumi/pulumi";
import { expect, test } from "vitest";
import { parse } from "yaml";

const isSecure = (value: unknown) =>
  typeof value === "object" && value !== null && "secure" in value;

// The real stack config; secrets are ciphertext in the file and the program
// only needs a value.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
const { config } = parse(
  readFileSync(new URL("Pulumi.next.yaml", import.meta.url), "utf-8")
) as { config: Record<string, unknown> };
const values: Record<string, string> = {};
for (const [key, value] of Object.entries(config)) {
  if (isSecure(value)) {
    values[key] = "placeholder";
  } else {
    values[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
}
// The credentials the owner creates for next (infra/README.md), and two
// provider secrets, so they are created, versioned and mounted.
for (const key of [
  "github:token",
  "posthog:apiKey",
  "wovain-next:resendAdminKey",
  "wovain-next:inngest-event-key",
  "wovain-next:polar-access-token",
]) {
  values[key] = "placeholder";
}
pulumi.runtime.setAllConfig(
  values,
  Object.keys(values).filter(
    (key) => isSecure(config[key]) || values[key] === "placeholder"
  )
);

const registered: string[] = [];
await pulumi.runtime.setMocks(
  {
    call: ({ inputs }) => ({ ...inputs, number: "123456789" }),
    newResource: ({ inputs, name, type }) => {
      registered.push(`${type}::${name}`);
      return { id: `${name}-id`, state: { token: "token", ...inputs } };
    },
  },
  "wovain-next",
  "next",
  false
);

test("the next program declares only next.wovain.com's own resources", async () => {
  await import("./index.ts");
  await pulumi.runtime.disconnect();
  expect(registered).toEqual(
    expect.arrayContaining([
      "gcp:cloudrunv2/service:Service::web-next",
      "gcp:sql/databaseInstance:DatabaseInstance::postgres-next",
      "gcp:sql/database:Database::wovain-next",
      "gcp:serviceaccount/account:Account::deploy-next",
      "gcp:serviceaccount/account:Account::web-runner-next",
      "gcp:artifactregistry/repository:Repository::images-next",
      "gcp:cloudrun/domainMapping:DomainMapping::next-wovain-com",
      "gcp:dns/recordSet:RecordSet::next-wovain-com-cname",
      "gcp:secretmanager/secret:Secret::inngest-event-key-next",
      "gcp:secretmanager/secret:Secret::polar-webhook-secret-next",
      "posthog:index/project:Project::project-next",
      "pulumi-nodejs:dynamic/resend:ApiKey::resend-next",
      "github:index/repositoryEnvironment:RepositoryEnvironment::next",
      "github:index/repositoryEnvironmentDeploymentPolicy:RepositoryEnvironmentDeploymentPolicy::next-main",
      "github:index/actionsEnvironmentVariable:ActionsEnvironmentVariable::next-GCP_DEPLOY_SERVICE_ACCOUNT",
      "github:index/actionsEnvironmentVariable:ActionsEnvironmentVariable::next-WEB_BUILD_ENV",
    ])
  );
  // Every name is next's, so nothing here can be production's or dev's.
  expect(registered.filter((r) => !r.includes("next"))).toEqual([]);
  expect(registered.filter((r, i) => registered.indexOf(r) !== i)).toEqual([]);
});
