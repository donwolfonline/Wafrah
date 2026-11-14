import { describe, expect, it } from "vitest";
import { encodeQrMatrix } from "./qr-matrix";
import { computeReedSolomonEcc, gfMul } from "./qr-tables";

function evaluateSyndromeAtRoot(codeword: Uint8Array, expIndex: number): number {
  let acc = 0;
  let alphaPow = 1;
  // Build alpha^expIndex via repeated multiplication by alpha (2) in GF(256)
  for (let k = 0; k < expIndex; k++) {
    alphaPow = gfMul(alphaPow, 2);
  }
  for (let i = 0; i < codeword.length; i++) {
    acc = gfMul(acc, alphaPow) ^ codeword[i]!;
  }
  return acc;
}

describe("ISO QR matrix encoder (Byte mode, ECC Level M)", () => {
  it("computes valid Reed-Solomon parity bytes whose syndromes vanish at all roots", () => {
    const sampleData = new TextEncoder().encode("SHAMI-JED-TEST");
    const ecCount = 16;
    const parity = computeReedSolomonEcc(sampleData, ecCount);
    expect(parity).toHaveLength(ecCount);

    const fullBlock = new Uint8Array(sampleData.length + ecCount);
    fullBlock.set(sampleData, 0);
    fullBlock.set(parity, sampleData.length);

    for (let i = 0; i < ecCount; i++) {
      expect(evaluateSyndromeAtRoot(fullBlock, i)).toBe(0);
    }
  });

  it("encodes kitchen login URLs with accurate dimensions, finder patterns, timing lines, and dark module", () => {
    const shortUrl = "https://wafrah.sa/login?tab=staff&code=SHAMI-JED";
    const qr = encodeQrMatrix(shortUrl);

    expect(qr.version).toBe(4);
    expect(qr.size).toBe(33);
    expect(qr.modules).toHaveLength(33);
    for (const row of qr.modules) {
      expect(row).toHaveLength(33);
    }

    // Finder centers (solid 3x3 inner squares) at top-left, top-right, bottom-left
    for (let dr = 2; dr <= 4; dr++) {
      for (let dc = 2; dc <= 4; dc++) {
        expect(qr.modules[dr]![dc]).toBe(true);
        expect(qr.modules[dr]![qr.size - 7 + dc]).toBe(true);
        expect(qr.modules[qr.size - 7 + dr]![dc]).toBe(true);
      }
    }

    // Timing line alternates strictly between finders
    for (let c = 8; c < qr.size - 8; c++) {
      expect(qr.modules[6]![c]).toBe(c % 2 === 0);
      expect(qr.modules[c]![6]).toBe(c % 2 === 0);
    }

    // Dark module invariant at (4*version + 9, 8)
    expect(qr.modules[qr.size - 8]![8]).toBe(true);
  });

  it("throws when input exceeds Version 8 capacity", () => {
    expect(() => encodeQrMatrix("x".repeat(200))).toThrow(/exceeds maximum/);
  });
});
