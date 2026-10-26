import type { Signature } from "./heal.ts";
import { normalizeMessage, testNameOf } from "./heal.ts";

// The heal:verify job's judgement (.gitlab/ci/heal.yml, heal-verify.ts): a
// heal MR's reproduction test must fail on the target branch with the
// original error, and pass with the fix. Results come from vitest's Node API.

export const TEST_FILE = /(?:^|\/)test\/.+\.test\.tsx?$/u;

export interface TestRun {
  name: string;
  status: string;
  failure: string;
}

// What runsOf reads of vitest's TestModule and TestCase.
interface TestCaseLike {
  fullName: string;
  result: () => {
    state: string;
    errors?:
      | readonly { message: string; stack?: string | undefined }[]
      | undefined;
  };
}
interface TestModuleLike {
  children: { allTests: () => Iterable<TestCaseLike> };
}

// One run per test, named and worded as vitest's JSON reporter did: suite
// titles joined with spaces, and each error's stack (or its message).
export const runsOf = (modules: Iterable<TestModuleLike>): TestRun[] =>
  [...modules].flatMap((module) =>
    [...module.children.allTests()].map((test) => {
      const { errors = [], state } = test.result();
      return {
        failure: errors.map((e) => e.stack || e.message).join("\n"),
        name: test.fullName.replaceAll(" > ", " "),
        status: state,
      };
    })
  );

export interface ReproVerdict {
  problems: string[];
  notes: string[];
}

// Problems fail the job; notes are printed only.
export const judgeRepro = (
  signature: Pick<Signature, "fingerprint" | "name" | "message">,
  base: TestRun[],
  head: TestRun[]
): ReproVerdict => {
  const name = testNameOf(signature);
  const mine = (runs: TestRun[]) => runs.filter((t) => t.name.includes(name));
  const problems: string[] = [];
  const notes: string[] = [];
  const headTests = mine(head);
  const baseTests = mine(base);
  if (headTests.length === 0) {
    problems.push(`no test named "${name}" in the changed test files`);
    return { notes, problems };
  }
  const notPassing = headTests.filter((t) => t.status !== "passed");
  if (notPassing.length > 0) {
    problems.push(
      `with the fix, ${notPassing.length} "${name}" test(s) don't pass`
    );
  }
  const failing = baseTests.filter((t) => t.status === "failed");
  if (failing.length === 0) {
    problems.push(
      `without the fix, no "${name}" test fails: it doesn't reproduce the error`
    );
  } else if (failing.some((t) => t.failure.includes(signature.name))) {
    const head40 = signature.message.slice(0, 40);
    const sameMessage = failing.some((t) =>
      normalizeMessage(t.failure).includes(head40)
    );
    notes.push(
      sameMessage
        ? `reproduces ${signature.name} with the original message`
        : `reproduces ${signature.name}; the message differs from production's (fine when it embeds data)`
    );
  } else {
    problems.push(
      `without the fix, the test fails, but not with ${signature.name}: it reproduces something else`
    );
  }
  return { notes, problems };
};
