import { randomBytes } from "node:crypto";

import { assert, integer, nat, property, string, tuple } from "fast-check";
import { describe, expect, it } from "vitest";

import { createSealer } from "./sealing";

// Property tests: fast-check generates tokens, contexts and bit flips.
// Runs are capped so CI time barely moves.
const RUNS = { numRuns: 100 };
const IV_BYTES = 12;
const BITS = 8;

const sealer = createSealer(randomBytes(32).toString("base64"));
const text = string({ maxLength: 200 });
const distinctPair = tuple(text, text).filter(([a, b]) => a !== b);

describe("sealer properties", () => {
  it("opens what it sealed", () => {
    assert(
      property(text, text, (plaintext, context) => {
        expect(sealer.open(sealer.seal(plaintext, context), context)).toBe(
          plaintext
        );
      }),
      RUNS
    );
  });

  it("does not open under another context", () => {
    assert(
      property(text, distinctPair, (plaintext, [context, other]) => {
        const sealed = sealer.seal(plaintext, context);
        expect(() => sealer.open(sealed, other)).toThrow();
      }),
      RUNS
    );
  });

  it("does not open when any bit is flipped", () => {
    assert(
      property(
        text,
        text,
        nat(),
        integer({ max: BITS - 1, min: 0 }),
        (plaintext, context, position, bit) => {
          const bytes = Buffer.from(sealer.seal(plaintext, context), "base64");
          const index = position % bytes.byteLength;
          const mask = 2 ** bit;
          const byte = bytes.readUInt8(index);
          const isSet = Math.floor(byte / mask) % 2 === 1;
          bytes.writeUInt8(isSet ? byte - mask : byte + mask, index);
          expect(() =>
            sealer.open(bytes.toString("base64"), context)
          ).toThrow();
        }
      ),
      RUNS
    );
  });

  it("uses a fresh nonce for every seal", () => {
    assert(
      property(text, text, (plaintext, context) => {
        const first = Buffer.from(sealer.seal(plaintext, context), "base64");
        const second = Buffer.from(sealer.seal(plaintext, context), "base64");
        expect(first.subarray(0, IV_BYTES)).not.toEqual(
          second.subarray(0, IV_BYTES)
        );
        expect(first).not.toEqual(second);
      }),
      RUNS
    );
  });
});
