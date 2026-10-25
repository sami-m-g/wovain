import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseSignature, testNameOf } from "./heal.ts";
import { TEST_FILE, judgeRepro, parseReport } from "./repro.ts";
import type { TestRun } from "./repro.ts";

// heal:verify (.gitlab/ci/heal.yml), on merge request pipelines: when the MR
// carries a heal signature (the heal flow copies its issue's marker into the
// MR description, and wovain ops checks it matches the issue before
// auto-merge), the changed tests named "heal <fingerprint>" must fail on the
// target branch with the original error class and pass with the fix.

const base = process.env["CI_MERGE_REQUEST_DIFF_BASE_SHA"];
const signature = parseSignature(
  process.env["CI_MERGE_REQUEST_DESCRIPTION"] ?? null
);
if (signature === undefined || base === undefined) {
  console.log("Not a heal merge request: nothing to verify.");
  process.exit(0);
}

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf-8" }).trim();
const changed = git("diff", "--name-only", `${base}...HEAD`)
  .split("\n")
  .filter((p) => p !== "");
const tests = changed.filter((p) => TEST_FILE.test(p) && existsSync(p));
const sources = changed.filter((p) => !TEST_FILE.test(p));

// The package that owns each test file: the directory above its test/.
const packageOf = (file: string) => {
  const at = file.lastIndexOf("/test/");
  return at === -1 ? path.dirname(file) : file.slice(0, at);
};

const out = mkdtempSync(path.join(tmpdir(), "heal-verify-"));
const run = (label: string): TestRun[] => {
  const runs: TestRun[] = [];
  for (const pkg of new Set(tests.map(packageOf))) {
    const report = path.join(out, `${label}-${pkg.replaceAll("/", "_")}.json`);
    const files = tests
      .filter((t) => packageOf(t) === pkg)
      .map((t) => path.relative(pkg, t));
    // vitest exits non-zero when a test fails; the report says which.
    spawnSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        ...files,
        "--reporter=json",
        `--outputFile=${report}`,
        "-t",
        testNameOf(signature),
      ],
      { cwd: pkg, stdio: "inherit" }
    );
    if (existsSync(report)) {
      runs.push(...parseReport(JSON.parse(readFileSync(report, "utf-8"))));
    }
  }
  return runs;
};

const head = run("head");
// The target branch's code with the MR's tests: undo every non-test change.
for (const file of sources) {
  const existed =
    spawnSync("git", ["cat-file", "-e", `${base}:${file}`]).status === 0;
  if (existed) {
    git("checkout", base, "--", file);
  } else {
    rmSync(file, { force: true });
  }
}
const before = run("base");
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
