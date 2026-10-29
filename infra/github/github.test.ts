// The github program against mocks, like ../program.test.ts.
import { readFileSync } from "node:fs";

import * as pulumi from "@pulumi/pulumi";
import { expect, test } from "vitest";
import { parse } from "yaml";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
const { config } = parse(
  readFileSync(new URL("Pulumi.github.yaml", import.meta.url), "utf-8")
) as { config: Record<string, string> };
pulumi.runtime.setAllConfig(
  {
    ...config,
    "github:token": "placeholder",
    "wovain-github:gitguardian-api-key": "placeholder",
  },
  ["github:token", "wovain-github:gitguardian-api-key"]
);

const registered: string[] = [];
const inputsOf = new Map<string, Record<string, unknown>>();
await pulumi.runtime.setMocks(
  {
    call: ({ inputs }) => inputs,
    newResource: ({ inputs, name, type }) => {
      registered.push(`${type}::${name}`);
      inputsOf.set(`${type}::${name}`, inputs);
      return { id: `${name}-id`, state: inputs };
    },
  },
  "wovain-github",
  "github",
  false
);

const REPOSITORY = "github:index/repository:Repository::wovain";
const MAIN = "github:index/repositoryRuleset:RepositoryRuleset::main";

test("the github program declares the repository's own resources only", async () => {
  await import("./index.ts");
  await pulumi.runtime.disconnect();
  expect(registered.toSorted()).toEqual(
    [
      REPOSITORY,
      "github:index/repositoryDependabotSecurityUpdates:RepositoryDependabotSecurityUpdates::wovain",
      MAIN,
      "github:index/repositoryRuleset:RepositoryRuleset::release",
      "github:index/issueLabel:IssueLabel::dependencies",
      "github:index/actionsSecret:ActionsSecret::GITGUARDIAN_API_KEY",
      "github:index/repositoryEnvironment:RepositoryEnvironment::github-infrastructure",
      "github:index/repositoryEnvironmentDeploymentPolicy:RepositoryEnvironmentDeploymentPolicy::github-infrastructure-main",
    ].toSorted()
  );
  // Nothing of Google's: the stack runs with only a GitHub token.
  expect(registered.filter((r) => !r.startsWith("github:"))).toEqual([]);
});

test("pull requests merge themselves once CodeRabbit and CI pass", () => {
  expect(inputsOf.get(REPOSITORY)).toMatchObject({
    allowAutoMerge: true,
    deleteBranchOnMerge: true,
  });
  const main = inputsOf.get(MAIN) as {
    bypassActors?: unknown[];
    enforcement: string;
    rules: {
      pullRequest: { requiredApprovingReviewCount: number };
      requiredStatusChecks: { requiredChecks: { context: string }[] };
    };
  };
  expect(main.enforcement).toBe("active");
  expect(main.bypassActors ?? []).toEqual([]);
  expect(main.rules.pullRequest.requiredApprovingReviewCount).toBe(1);
  expect(
    main.rules.requiredStatusChecks.requiredChecks
      .map(({ context }) => context)
      .toSorted()
  ).toEqual(
    [
      "codeql",
      "dependency-review",
      "infra",
      "osv / osv-scan",
      "verify",
    ].toSorted()
  );
});
