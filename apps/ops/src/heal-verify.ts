import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { startVitest } from "vitest/node";

import { ENV } from "./env.ts";
import { parseSignature, testNameOf } from "./heal.ts";
import { TEST_FILE, judgeRepro, runsOf } from "./repro.ts";
import type { TestRun } from "./repro.ts";
import { fromRoot } from "./root.ts";

// heal:verify (.gitlab/ci/heal.yml), on merge request pipelines: when the MR
// carries a heal signature (the heal flow copies its issue's marker into the
// MR description, and wovain ops checks it matches the issue before
// auto-merge), the changed tests named "heal <fingerprint>" must fail on the
// target branch with the original error class and pass with the fix.

const base = ENV.CI_MERGE_REQUEST_DIFF_BASE_SHA;
const signature = parseSignature(ENV.CI_MERGE_REQUEST_DESCRIPTION ?? null);
if (signature === undefined || base === undefined) {
  console.log("Not a heal merge request: nothing to verify.");
  process.exit(0);
}

// Paths from git are relative to the repository root.
const root = fromRoot();
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
const changed = git("diff", "--name-only", `${base}...HEAD`)
  .split("\n")
  .filter((p) => p !== "");
const tests = changed.filter(
  (p) => TEST_FILE.test(p) && existsSync(path.join(root, p))
);
const sources = changed.filter((p) => !TEST_FILE.test(p));

// The package that owns each test file: the directory above its test/.
const packageOf = (file: string) => {
  const at = file.lastIndexOf("/test/");
  return at === -1 ? path.dirname(file) : file.slice(0, at);
};

// Each package runs its own vitest config, in a fresh instance (so the second
// run, after the checkout, loads nothing from the first). Vitest sets the exit
// code when a test fails; the report says which, and the verdict decides.
const run = async (): Promise<TestRun[]> => {
  const runs: TestRun[] = [];
  for (const pkg of new Set(tests.map(packageOf))) {
    const files = tests
      .filter((t) => packageOf(t) === pkg)
      .map((t) => path.relative(pkg, t));
    // oxlint-disable-next-line eslint/no-await-in-loop -- one package's vitest at a time
    const vitest = await startVitest(files, {
      root: path.join(root, pkg),
      run: true,
      testNamePattern: testNameOf(signature),
      watch: false,
    });
    try {
      runs.push(...runsOf(vitest.state.getTestModules()));
    } finally {
      // oxlint-disable-next-line eslint/no-await-in-loop -- same package
      await vitest.close();
    }
  }
  return runs;
};

const head = await run();
// The target branch's code with the MR's tests: undo every non-test change.
for (const file of sources) {
  const existed =
    spawnSync("git", ["cat-file", "-e", `${base}:${file}`], { cwd: root })
      .status === 0;
  if (existed) {
    git("checkout", base, "--", file);
  } else {
    rmSync(path.join(root, file), { force: true });
  }
}
const before = await run();
git("checkout", "HEAD", "--", ".");

const { notes, problems } = judgeRepro(signature, before, head);
console.log(
  `\nheal:verify for signature ${signature.fingerprint} (${signature.name} on ${signature.method} ${signature.path})`
);
for (const line of notes) {
  console.log(`ok: ${line}`);
}
for (const line of problems) {
  console.error(`problem: ${line}`);
}
process.exitCode = problems.length === 0 ? 0 : 1;
