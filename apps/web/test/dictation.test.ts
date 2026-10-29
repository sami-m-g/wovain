import { describe, expect, it } from "vitest";

import { insertAtCursor } from "@/lib/dictation";

describe("insertAtCursor", () => {
  it("inserts at the cursor with single spaces around the words", () => {
    expect(
      insertAtCursor({
        end: 5,
        start: 5,
        text: " retro surf ",
        value: "A tee for fans",
      })
    ).toEqual({ caret: 16, value: "A tee retro surf for fans" });
  });

  it("replaces a selection and fills an empty field", () => {
    expect(
      insertAtCursor({
        end: 9,
        start: 2,
        text: "cats",
        value: "A tee for fans",
      })
    ).toMatchObject({ value: "A cats fans" });
    expect(
      insertAtCursor({ end: 0, start: 0, text: "hello", value: "" })
    ).toEqual({ caret: 5, value: "hello" });
  });

  it("keeps the field within its length limit", () => {
    expect(
      insertAtCursor({
        end: 3,
        maxLength: 8,
        start: 3,
        text: "retro surf",
        value: "abc",
      })
    ).toEqual({ caret: 8, value: "abc retr" });
  });
});
