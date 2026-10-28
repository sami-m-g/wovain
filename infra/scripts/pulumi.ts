// Runs `pulumi preview` or `pulumi up` on a stack the way CI does
// (.github/workflows/infra.yml), so no step is done by hand:
//
//   node infra/scripts/pulumi.ts preview infra [-- pulumi args]
//   node infra/scripts/pulumi.ts up infra/bootstrap [-- pulumi args, e.g. --yes]
//
// 1. State changes no program can make (migrateState below): drop GitLab's
//    resources from the state, since GitLab is archived and Pulumi must
//    never call it, and unprotect what policy/retired.ts retires that way.
//    Each step checks the state first, so running it again does nothing.
// 2. The policy pack, always. (Frozen resources, ../freeze.json, are held
//    by ../freeze.ts in the program itself.)
//
// A preview never writes the real state: it runs on a copy in a local
// backend, with step 1 applied to the copy, so it shows what `up` will do.
// Only `up` migrates the real state, then applies.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parse } from "yaml";

import { RETIRED } from "../policy/retired.ts";

const STACK = "prod";
const repo = path.resolve(import.meta.dirname, "../..");
const [command, dir = "infra", ...rest] = process.argv.slice(2);
if (command !== "preview" && command !== "up") {
  throw new Error(
    "Usage: node infra/scripts/pulumi.ts <preview|up> <infra|infra/bootstrap> [-- args]"
  );
}
const cwd = path.resolve(repo, dir);
const extra = rest[0] === "--" ? rest.slice(1) : rest;
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's project file
const { name: project } = parse(
  readFileSync(path.join(cwd, "Pulumi.yaml"), "utf-8")
) as { name?: string };
if (project === undefined) {
  throw new Error(`${cwd}/Pulumi.yaml has no name`);
}

const pulumi = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync("pulumi", [...args, "--cwd", cwd], {
    encoding: "utf-8",
    env,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });

interface StateResource {
  protect?: boolean;
  type: string;
  urn: string;
}

// A state change: its output goes to stderr, so a preview's --json stays
// clean on stdout.
const change = (args: string[], env: NodeJS.ProcessEnv) =>
  execFileSync("pulumi", [...args, "--cwd", cwd], {
    env,
    stdio: ["ignore", process.stderr, "inherit"],
  });

const resources = (env: NodeJS.ProcessEnv) => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's checkpoint format
  const state = JSON.parse(
    pulumi(["stack", "export", "--stack", STACK], env)
  ) as {
    deployment: { resources?: StateResource[] };
  };
  return state.deployment.resources ?? [];
};

const GITLAB_PROVIDER = /^pulumi:providers:(?:gitlab|graphql)$/u;
const urnFor = (key: string) => `urn:pulumi:${STACK}::${key}`;

const migrateState = (env: NodeJS.ProcessEnv) => {
  // Deleting a provider with --target-dependents drops every resource that
  // uses it from the state; GitLab itself is never called.
  for (const { urn } of resources(env).filter(({ type }) =>
    GITLAB_PROVIDER.test(type)
  )) {
    process.stderr.write(`state: forget ${urn} and its resources\n`);
    change(
      [
        "state",
        "delete",
        urn,
        "--stack",
        STACK,
        "--yes",
        "--force",
        "--target-dependents",
      ],
      env
    );
  }
  const protectedUrns = new Set(
    resources(env)
      .filter((resource) => resource.protect === true)
      .map(({ urn }) => urn)
  );
  for (const [key, release] of Object.entries(RETIRED)) {
    const urn = urnFor(key);
    if (
      release === "unprotect" &&
      key.startsWith(`${project}::`) &&
      protectedUrns.has(urn)
    ) {
      process.stderr.write(`state: unprotect ${urn}\n`);
      change(["state", "unprotect", urn, "--stack", STACK, "--yes"], env);
    }
  }
};

// A copy of the real state in a throwaway local backend. The stack file
// (secrets provider, encrypted key) stays as it is in the checkout.
const localCopy = () => {
  const backend = mkdtempSync(path.join(tmpdir(), "pulumi-state-"));
  const checkpoint = path.join(backend, "checkpoint.json");
  writeFileSync(checkpoint, pulumi(["stack", "export", "--stack", STACK]));
  const stackFile = path.join(cwd, `Pulumi.${STACK}.yaml`);
  const stackConfig = readFileSync(stackFile, "utf-8");
  const env = { ...process.env, PULUMI_BACKEND_URL: `file://${backend}` };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
  const { secretsprovider: secretsProvider } = parse(stackConfig) as {
    secretsprovider?: string;
  };
  if (secretsProvider === undefined) {
    throw new Error(`${stackFile} has no secretsprovider`);
  }
  pulumi(
    [
      "stack",
      "init",
      STACK,
      "--no-select",
      "--secrets-provider",
      secretsProvider,
    ],
    env
  );
  writeFileSync(stackFile, stackConfig);
  pulumi(["stack", "import", "--stack", STACK, "--file", checkpoint], env);
  return env;
};

const env = command === "preview" ? localCopy() : process.env;
migrateState(env);
execFileSync(
  "pulumi",
  [
    command,
    "--cwd",
    cwd,
    "--stack",
    STACK,
    "--policy-pack",
    path.join(repo, "infra/policy"),
    ...extra,
  ],
  { env, stdio: "inherit" }
);
