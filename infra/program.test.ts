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
  // GitHub is the primary repository: production declares its Production
  // and dev environments and the Actions variables deploy.yml reads
  // (docs/adr/0004-release-branch.md). next's environment is its own
  // stack's (next/next.test.ts); the repository, its rulesets, label and
  // secret, and the `infrastructure` environment production's `up` runs in,
  // are the github stack's (github/github.test.ts).
  for (const urn of [
    "github:index/repositoryEnvironment:RepositoryEnvironment::production",
    "github:index/repositoryEnvironmentDeploymentPolicy:RepositoryEnvironmentDeploymentPolicy::production-release",
    "github:index/repositoryEnvironment:RepositoryEnvironment::dev",
    "github:index/repositoryEnvironmentDeploymentPolicy:RepositoryEnvironmentDeploymentPolicy::dev-main",
    "github:index/actionsVariable:ActionsVariable::GCP_WORKLOAD_IDENTITY_PROVIDER",
    "github:index/actionsEnvironmentVariable:ActionsEnvironmentVariable::production-GCP_DEPLOY_SERVICE_ACCOUNT",
    "github:index/actionsEnvironmentVariable:ActionsEnvironmentVariable::dev-GCP_DEPLOY_SERVICE_ACCOUNT",
    "gcp:serviceaccount/iAMMember:IAMMember::deployer-from-github",
    // dev deploys as its own account, never production's.
    "gcp:serviceaccount/account:Account::deploy-dev",
    "posthog:index/project:Project::project-dev",
  ]) {
    expect(registered).toContain(urn);
  }
  // main never deploys production: GitHub's `production-main` policy is
  // gone; production's deploy account has no grant on dev; and neither dev
  // nor next mounts any of production's secrets: each has its own.
  expect(registered).not.toContain(
    "github:index/repositoryEnvironmentDeploymentPolicy:RepositoryEnvironmentDeploymentPolicy::production-main"
  );
  // Two stacks never own one environment.
  expect(registered).not.toContain(
    "github:index/repositoryEnvironment:RepositoryEnvironment::infrastructure"
  );
  for (const urn of [
    "gcp:serviceaccount/iAMMember:IAMMember::deployer-acts-as-runner-dev",
    "gcp:secretmanager/secretIamMember:SecretIamMember::deployer-database-url-dev",
    "gcp:kms/cryptoKeyIAMMember:CryptoKeyIAMMember::runner-dev-connections",
  ]) {
    expect(registered).not.toContain(urn);
  }
  // next.wovain.com is its own stack (next/): nothing of it is declared
  // here, so applying production's stack never touches it, and the reverse.
  expect(registered.filter((r) => r.includes("next"))).toEqual([]);
  for (const env of ["dev"]) {
    for (const id of [
      "inngest-event-key",
      "inngest-signing-key",
      "polar-access-token",
      "nebius-api-key",
    ]) {
      expect(registered).toContain(
        `gcp:secretmanager/secret:Secret::${id}-${env}`
      );
    }
  }
  // Nothing GitLab is left: the project is read-only, so Pulumi must never
  // plan a change to it (infra/README.md, "Leaving GitLab").
  expect(
    registered.filter(
      (r) => r.startsWith("gitlab:") || r.startsWith("graphql:")
    )
  ).toEqual([]);
  // The repository's own resources aren't production's to change.
  expect(
    registered.filter((r) =>
      /^github:index\/(?:repository|repositoryRuleset|issueLabel|actionsSecret|repositoryDependabotSecurityUpdates|appInstallationRepository):/u.test(
        r
      )
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

test("retired resources match what the program declares", async () => {
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
});

// A protected resource in a `pulumi stack export` checkpoint.
const resource = (urn: string, retainOnDelete: boolean) => ({
  protect: true,
  retainOnDelete,
  type: urn.split("::")[2] ?? "",
  urn,
});

test("the state migration releases retired resources no `up` released", async () => {
  const { releaseDeleted } = await import("./scripts/state.ts");
  // Production's state on 2026-10-29: #47 released these in code and #48
  // deleted the declarations, with no `up` in between, so the state still
  // protects and retains them, and every preview failed on the delete.
  const stale = [
    "gcp:firebase/appHostingBackend:AppHostingBackend::app",
    "gcp:secretmanager/secret:Secret::openrouter-api-key",
    "gcp:secretmanager/secret:Secret::otel-exporter-otlp-endpoint",
    "gcp:secretmanager/secret:Secret::otel-exporter-otlp-headers",
    "gcp:secretmanager/secret:Secret::workos-api-key",
    "gcp:secretmanager/secretVersion:SecretVersion::workos-api-key",
    "gcp:serviceaccount/account:Account::app-hosting",
    "gcp:storage/bucket:Bucket::apphosting-sources",
  ].map((key) => `urn:pulumi:prod::wovain::${key}`);
  // Not retired, and retired by `pulumi state unprotect`: left alone.
  const untouched = [
    "gcp:sql/databaseInstance:DatabaseInstance::db",
    "gcp:serviceaccount/account:Account::gitlab-ops",
  ].map((key) => `urn:pulumi:prod::wovain::${key}`);
  const checkpoint = {
    deployment: {
      resources: [
        ...stale.map((urn) => resource(urn, true)),
        ...untouched.map((urn) => resource(urn, false)),
      ],
    },
  };
  expect(releaseDeleted(checkpoint)).toEqual(stale);
  for (const { protect, retainOnDelete, urn } of checkpoint.deployment
    .resources) {
    expect(protect).toBe(untouched.includes(urn));
    expect(retainOnDelete).toBe(false);
  }
  // A second run finds nothing left to release.
  expect(releaseDeleted(checkpoint)).toEqual([]);
});

const urn = (key: string) => `urn:pulumi:prod::wovain::${key}`;

test("the state migration forgets what moved to the github stack", async () => {
  const { movedOut } = await import("./scripts/state.ts");
  // Production's GitHub resources on 2026-10-29, in state order: the
  // repository before the two that depend on it.
  const repository = urn("github:index/repository:Repository::wovain");
  const deployKey = urn(
    "github:index/repositoryDeployKey:RepositoryDeployKey::gitlab-ci-mirror"
  );
  const ruleset = urn(
    "github:index/repositoryRuleset:RepositoryRuleset::main-from-gitlab"
  );
  const kept = urn("gcp:sql/databaseInstance:DatabaseInstance::db");
  const checkpoint = {
    deployment: {
      resources: [
        resource(kept, false),
        resource(repository, true),
        resource(deployKey, false),
        resource(ruleset, false),
      ],
    },
  };
  // Dependents first, so each `pulumi state delete` succeeds; the rest stays.
  expect(movedOut(checkpoint)).toEqual([ruleset, deployKey, repository]);
  // Once forgotten, a second run finds nothing.
  expect(
    movedOut({ deployment: { resources: [resource(kept, false)] } })
  ).toEqual([]);
});
