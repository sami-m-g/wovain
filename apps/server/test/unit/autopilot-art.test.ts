import { describe, expect, test } from "vitest";

import { artPieceSchema, artRequest } from "../../src/lib/art-plan.ts";
import { launchSnapshot } from "../../src/lib/campaign-plan.ts";
import { textField } from "../../src/lib/fal-media.ts";
import { snapshotOf } from "../../src/lib/meta-staged.ts";
import type { Staged } from "../../src/lib/meta-staged.ts";
import { demoDesign } from "../helpers.ts";

const piece = (text?: string[]) =>
  artPieceSchema.parse({
    name: "hero front",
    prompt: "A calico cat at sunset",
    ...(text === undefined ? {} : { text }),
  });

describe("declared art text", () => {
  test("the model is told to print only the declared words", () => {
    expect(artRequest(piece([])).input.prompt).toContain(
      "No text, letters or numbers"
    );
    expect(artRequest(piece(["NEKO CLUB"])).input.prompt).toContain(
      '"NEKO CLUB". Print no other text.'
    );
    expect(artRequest(piece()).input.prompt).not.toContain("text");
  });

  test("OCR's reading is found wherever fal puts it", () => {
    expect(
      textField(
        { content: [{ text: JSON.stringify({ data: { results: "NEKO" } }) }] },
        "results"
      )
    ).toBe("NEKO");
    expect(textField({ structuredContent: { other: 1 } }, "results")).toBe(
      undefined
    );
  });
});

describe("launchSnapshot", () => {
  const staged: Staged = {
    adAccountId: "act_1",
    adSets: [],
    ads: [],
    campaignId: "1",
    creatives: [],
    frozen: true,
    images: [],
    videos: [],
  };
  const hidden = { ...demoDesign, hidden: true, id: "d1", productId: "off_1" };

  test("is the draft's snapshot when nothing is hidden", () => {
    expect(launchSnapshot(staged, [], [{ ...demoDesign, id: "d1" }])).toBe(
      snapshotOf(staged, [])
    );
  });

  test("pins the exact hidden drops: another offer or design doesn't match", () => {
    const shown = launchSnapshot(staged, [], [hidden]);
    expect(launchSnapshot(staged, [], [hidden])).toBe(shown);
    expect(
      launchSnapshot(staged, [], [{ ...hidden, productId: "off_2" }])
    ).not.toBe(shown);
    expect(
      launchSnapshot(staged, [], [hidden, { ...hidden, id: "d2" }])
    ).not.toBe(shown);
  });
});
