// Runs `pulumi preview` or `pulumi up` on a stack the way CI does
// (.github/workflows/infra.yml), so no step is done by hand:
//
//   node infra/scripts/pulumi.ts preview infra [-- pulumi args]
//   node infra/scripts/pulumi.ts up infra/bootstrap [-- pulumi args, e.g. --yes]
//   node infra/scripts/pulumi.ts up infra/next
//
// Each directory holds one stack, the one `Pulumi.<stack>.yaml` names: `prod`
// in infra/ and infra/bootstrap, `next` in infra/next. A stack that isn't in
// the state yet previews from an empty state, and `up` creates it with the
// stack file's secrets provider.
//
// 1. State changes no program can make (migrateState below): drop GitLab's
//    resources from the state, since GitLab is archived and Pulumi must
//    never call it, and unprotect what policy/retired.ts retires that way.
//    Each step checks the state first, so running it again does nothing.
// 2. The policy pack, always.
//
// A preview never writes the real state: it runs on a copy in a local
// backend, with step 1 applied to the copy, so it shows what `up` will do.
// `up` first runs that preview through the guard (policy/guard.ts), which
// stops on a delete of stateful data or a change to frozen production; only
// then does it migrate the real state and apply.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parse } from "yaml";

import { RETIRED } from "../policy/retired.ts";

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
const STACK_FILE = /^Pulumi\.(?<stack>[\w-]+)\.yaml$/u;
const stacks = readdirSync(cwd).flatMap(
  (file) => STACK_FILE.exec(file)?.groups?.["stack"] ?? []
);
const [STACK] = stacks;
if (STACK === undefined || stacks.length > 1) {
  throw new Error(`${cwd} needs exactly one Pulumi.<stack>.yaml`);
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

const stackFile = path.join(cwd, `Pulumi.${STACK}.yaml`);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
const { secretsprovider: secretsProvider } = parse(
  readFileSync(stackFile, "utf-8")
) as { secretsprovider?: string };
if (secretsProvider === undefined) {
  throw new Error(`${stackFile} has no secretsprovider`);
}

// Creates the stack in a backend, keeping the stack file (secrets provider,
// encrypted key, config) as it is in the checkout.
const initStack = (env: NodeJS.ProcessEnv) => {
  const stackConfig = readFileSync(stackFile, "utf-8");
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
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `pulumi stack ls --json`
const existing = JSON.parse(pulumi(["stack", "ls", "--json"])) as {
  name: string;
}[];
const stackExists = existing.some(({ name }) => name === STACK);

// A copy of the real state in a throwaway local backend, or an empty stack
// when the real one doesn't exist yet.
const localCopy = () => {
  const backend = mkdtempSync(path.join(tmpdir(), "pulumi-state-"));
  const env = { ...process.env, PULUMI_BACKEND_URL: `file://${backend}` };
  initStack(env);
  if (stackExists) {
    const checkpoint = path.join(backend, "checkpoint.json");
    writeFileSync(checkpoint, pulumi(["stack", "export", "--stack", STACK]));
    pulumi(["stack", "import", "--stack", STACK, "--file", checkpoint], env);
  }
  return env;
};

const policyArgs = [
  "--cwd",
  cwd,
  "--stack",
  STACK,
  "--policy-pack",
  path.join(repo, "infra/policy"),
];
const previewEnv = localCopy();
migrateState(previewEnv);
if (command === "preview") {
  execFileSync("pulumi", ["preview", ...policyArgs, ...extra], {
    env: previewEnv,
    stdio: "inherit",
  });
} else {
  const plan = execFileSync("pulumi", ["preview", ...policyArgs, "--json"], {
    encoding: "utf-8",
    env: previewEnv,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  // Exits non-zero, with the reason on stderr, when the plan is blocked.
  execFileSync("node", [path.join(repo, "infra/policy/guard.ts")], {
    input: plan,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (!stackExists) {
    initStack(process.env);
  }
  migrateState(process.env);
  execFileSync("pulumi", ["up", ...policyArgs, ...extra], {
    stdio: "inherit",
  });
}
