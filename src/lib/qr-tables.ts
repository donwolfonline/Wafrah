/**
 * ISO/IEC 18004 QR Code Error Correction Level M parameters and GF(256)
 * Reed-Solomon error correction coding for Versions 1–8.
 */

export interface QrEccSpec {
  maxBytes: number;
  ecPerBlock: number;
  blocks: Array<{ count: number; dataCodewords: number }>;
  alignmentCenters: number[];
}

export const QR_ECC_M_SPECS: Record<number, QrEccSpec> = {
  1: {
    maxBytes: 14,
    ecPerBlock: 10,
    blocks: [{ count: 1, dataCodewords: 16 }],
    alignmentCenters: [],
  },
  2: {
    maxBytes: 26,
    ecPerBlock: 16,
    blocks: [{ count: 1, dataCodewords: 28 }],
    alignmentCenters: [6, 18],
  },
  3: {
    maxBytes: 42,
    ecPerBlock: 26,
    blocks: [{ count: 1, dataCodewords: 44 }],
    alignmentCenters: [6, 22],
  },
  4: {
    maxBytes: 62,
    ecPerBlock: 18,
    blocks: [{ count: 2, dataCodewords: 32 }],
    alignmentCenters: [6, 26],
  },
  5: {
    maxBytes: 84,
    ecPerBlock: 24,
    blocks: [{ count: 2, dataCodewords: 43 }],
    alignmentCenters: [6, 30],
  },
  6: {
    maxBytes: 106,
    ecPerBlock: 16,
    blocks: [{ count: 4, dataCodewords: 27 }],
    alignmentCenters: [6, 34],
  },
  7: {
    maxBytes: 122,
    ecPerBlock: 18,
    blocks: [{ count: 4, dataCodewords: 31 }],
    alignmentCenters: [6, 22, 38],
  },
  8: {
    maxBytes: 152,
    ecPerBlock: 22,
    blocks: [
      { count: 2, dataCodewords: 38 },
      { count: 2, dataCodewords: 39 },
    ],
    alignmentCenters: [6, 24, 42],
  },
};

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

export function computeReedSolomonEcc(
  data: Uint8Array,
  ecLength: number,
): Uint8Array {
  let generator = [1];
  for (let i = 0; i < ecLength; i++) {
    const next = new Array<number>(generator.length + 1).fill(0);
    const root = GF_EXP[i]!;
    for (let j = 0; j < generator.length; j++) {
      next[j] ^= generator[j]!;
      next[j + 1] ^= gfMul(generator[j]!, root);
    }
    generator = next;
  }

  const remainder = new Uint8Array(ecLength);
  for (let i = 0; i < data.length; i++) {
    const factor = (data[i]! ^ remainder[0]!) & 0xff;
    for (let j = 0; j < ecLength - 1; j++) {
      remainder[j] = remainder[j + 1]!;
    }
    remainder[ecLength - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLength; j++) {
        remainder[j] ^= gfMul(generator[j + 1]!, factor);
      }
    }
  }
  return remainder;
}

export function selectQrVersion(byteLength: number): number {
  for (let version = 1; version <= 8; version++) {
    if (byteLength <= QR_ECC_M_SPECS[version]!.maxBytes) {
      return version;
    }
  }
  throw new Error(
    `Input exceeds maximum Version 8 Byte capacity (${byteLength} > 152 bytes)`,
  );
}
