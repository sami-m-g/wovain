import { Inngest, NonRetriableError } from "inngest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nameIdeas } from "../flow/ideas";
import {
  approvedDesigns,
  autopilotStep,
  awaitApproval,
  awaitIdeas,
  campaignStep,
  designStep,
  finishRun,
  productStep,
  researchStep,
} from "../flow/runs";
import type { RunServices } from "./run";
import { createRunWorkflow } from "./run";

// Each step of the seller run as Mastra executes it, with the flow it calls
// mocked: what it hands the next step, when it suspends at a gate, when it
// ends the run, and which errors it retries. The flow itself is tested on
// PGlite in ../flow/durable.test.ts.

vi.mock("../flow/agent-trace", () => ({
  withAgentTrace: async (
    _actor: unknown,
    _trace: unknown,
    run: (routed: boolean) => Promise<unknown>
  ) => await run(false),
}));
vi.mock("../flow/ideas", () => ({ nameIdeas: vi.fn() }));
vi.mock("../flow/runs", () => ({
  approvedDesigns: vi.fn(),
  autopilotRejection: (reasons: string[]) => reasons.join("; "),
  autopilotStep: vi.fn(),
  awaitApproval: vi.fn(),
  awaitIdeas: vi.fn(),
  campaignStep: vi.fn(),
  designStep: vi.fn(),
  finishRun: vi.fn(),
  productStep: vi.fn(),
  researchStep: vi.fn(),
}));

const workflow = createRunWorkflow(
  new Inngest({ id: "run-steps-test" }),
  {} as RunServices
);

const input = {
  autopilot: false,
  countries: ["US"],
  dailyBudget: 5,
  seed: "y2k racing",
};
const from = { input, runId: "run_1", userId: "user_1" };
const autopilot = { ...from, input: { ...input, autopilot: true } };

const BAILED = Symbol("bailed");
const SUSPENDED = Symbol("suspended");
const bail = vi.fn(() => BAILED);
const suspend = vi.fn(async () => await Promise.resolve(SUSPENDED));

const execute = async (
  id: string,
  inputData: object,
  resumeData?: object
): Promise<unknown> => {
  const step = workflow.steps[id];
  if (step === undefined) {
    throw new Error(`No step ${id}`);
  }
  return await step.execute({ bail, inputData, resumeData, suspend } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seller-run steps", () => {
  it("is research, name, ideas, design, approval, product, campaign", () => {
    expect(Object.keys(workflow.steps)).toEqual([
      "research",
      "name",
      "ideas",
      "design",
      "approval",
      "product",
      "campaign",
    ]);
  });

  it("research hands its ideas on", async () => {
    vi.mocked(researchStep).mockResolvedValue({ ideaIds: ["i1"] } as never);
    expect(await execute("research", from)).toEqual({
      ...from,
      ideaIds: ["i1"],
    });
    expect(researchStep).toHaveBeenCalledWith(
      expect.anything(),
      "run_1",
      input
    );
  });

  it("research with no ideas fails the run and stops", async () => {
    vi.mocked(researchStep).mockResolvedValue({ ideaIds: [] } as never);
    expect(await execute("research", from)).toBe(BAILED);
    expect(finishRun).toHaveBeenCalledWith(expect.anything(), "run_1", {
      error: "Research found no ideas for this seed.",
      status: "failed",
    });
  });

  it("name names the ideas and passes on only the named ones", async () => {
    vi.mocked(nameIdeas).mockResolvedValue([{ id: "i2" }] as never);
    const carry = { ...from, ideaIds: ["i1", "i2"] };
    expect(await execute("name", carry)).toEqual({ ...carry, ideaIds: ["i2"] });
    expect(nameIdeas).toHaveBeenCalledWith(
      expect.anything(),
      ["i1", "i2"],
      "run_1"
    );
  });

  it("name fails the run when no idea could be named", async () => {
    vi.mocked(nameIdeas).mockResolvedValue([] as never);
    expect(await execute("name", { ...from, ideaIds: ["i1"] })).toBe(BAILED);
    expect(finishRun).toHaveBeenCalledWith(expect.anything(), "run_1", {
      error: "No idea got a title its evidence supports.",
      status: "failed",
    });
  });

  it.each([
    [
      "autopilot goes on with research's ideas",
      { ...autopilot, ideaIds: ["i1"] },
      undefined,
      { ...autopilot, ideaIds: ["i1"] },
    ],
    [
      "a merchant's run suspends with nothing drawn",
      { ...from, ideaIds: ["i1"] },
      undefined,
      SUSPENDED,
    ],
    [
      "a resumed run draws only the chosen ideas",
      { ...from, ideaIds: ["i1", "i2"] },
      { ideaIds: ["i2"] },
      { ...from, ideaIds: ["i2"] },
    ],
  ])("ideas gate: %s", async (_case, carry, resumeData, expected) => {
    expect(await execute("ideas", carry, resumeData)).toEqual(expected);
    expect(vi.mocked(awaitIdeas).mock.calls).toHaveLength(
      expected === SUSPENDED ? 1 : 0
    );
  });

  it("design hands its designs and facts on", async () => {
    vi.mocked(designStep).mockResolvedValue({
      designIds: ["d1"],
      facts: [{ ok: true }],
    } as never);
    expect(await execute("design", { ...from, ideaIds: ["i1"] })).toEqual({
      ...from,
      designIds: ["d1"],
      facts: [{ ok: true }],
      ideaIds: ["i1"],
    });
  });

  it.each([
    {
      carry: { ...autopilot, designIds: ["d1", "d2"] },
      case: "autopilot approves",
      expected: { ...autopilot, designIds: ["d1"] },
      finished: undefined,
      setUp: () =>
        vi
          .mocked(autopilotStep)
          .mockResolvedValue({ approvedIds: ["d1"], reasons: [] } as never),
    },
    {
      carry: { ...autopilot, designIds: ["d1"] },
      case: "autopilot rejects every design",
      expected: BAILED,
      finished: { error: "off-brand", status: "failed" },
      setUp: () =>
        vi.mocked(autopilotStep).mockResolvedValue({
          approvedIds: [],
          reasons: ["off-brand"],
        } as never),
    },
    {
      carry: { ...from, designIds: ["d1"] },
      case: "a merchant's run suspends while designs are pending",
      expected: SUSPENDED,
      finished: undefined,
      setUp: () => vi.mocked(awaitApproval).mockResolvedValue(true),
    },
    {
      carry: { ...from, designIds: ["d1"] },
      case: "every design rejected completes the run",
      expected: BAILED,
      finished: { status: "completed" },
      resumeData: { approve: false },
      setUp: () => vi.mocked(approvedDesigns).mockResolvedValue([]),
    },
    {
      carry: { ...from, designIds: ["d1", "d2"] },
      case: "the approved designs go on",
      expected: { ...from, designIds: ["d2"] },
      finished: undefined,
      resumeData: { approve: true },
      setUp: () => vi.mocked(approvedDesigns).mockResolvedValue(["d2"]),
    },
  ])(
    "approval gate: $case",
    async ({ carry, expected, finished, resumeData, setUp }) => {
      setUp();
      expect(await execute("approval", carry, resumeData)).toEqual(expected);
      if (finished === undefined) {
        expect(finishRun).not.toHaveBeenCalled();
      } else {
        expect(finishRun).toHaveBeenCalledWith(
          expect.anything(),
          "run_1",
          finished
        );
      }
    }
  );

  it("product makes the approved designs' products", async () => {
    vi.mocked(productStep).mockResolvedValue({
      facts: [],
      productIds: ["p1"],
    } as never);
    expect(
      await execute("product", { ...autopilot, designIds: ["d1"] })
    ).toEqual({
      ...autopilot,
      designIds: ["d1"],
      facts: [],
      productIds: ["p1"],
    });
    expect(productStep).toHaveBeenCalledWith(
      expect.anything(),
      "run_1",
      ["d1"],
      { autopilot: true }
    );
  });

  it("campaign stages the campaign and completes the run", async () => {
    vi.mocked(campaignStep).mockResolvedValue({ facts: [{ ads: 3 }] } as never);
    expect(await execute("campaign", { ...from, productIds: ["p1"] })).toEqual({
      ...from,
      facts: [{ ads: 3 }],
      productIds: ["p1"],
    });
    expect(campaignStep).toHaveBeenCalledWith(expect.anything(), "run_1", {
      input,
      productIds: ["p1"],
    });
    expect(finishRun).toHaveBeenCalledWith(expect.anything(), "run_1", {
      status: "completed",
    });
  });

  it.each([
    [402, true],
    [409, true],
    [500, false],
    [undefined, false],
  ])(
    "a step that fails with status %s is permanent: %s",
    async (status, permanent) => {
      const error = Object.assign(new Error("provider said no"), { status });
      vi.mocked(designStep).mockRejectedValue(error);
      const thrown = await execute("design", from).catch(
        (error_: unknown) => error_
      );
      expect(thrown instanceof NonRetriableError).toBe(permanent);
      expect(thrown === error).toBe(!permanent);
    }
  );
});
