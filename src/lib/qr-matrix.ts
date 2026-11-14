import {
  computeReedSolomonEcc,
  QR_ECC_M_SPECS,
  type QrEccSpec,
  selectQrVersion,
} from "./qr-tables";

export interface QrMatrix {
  version: number;
  size: number;
  modules: boolean[][];
}

function pushBits(bits: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}

function encodeDataCodewords(bytes: Uint8Array, spec: QrEccSpec): Uint8Array {
  const totalDataCodewords = spec.blocks.reduce(
    (sum, b) => sum + b.count * b.dataCodewords,
    0,
  );
  const bits: number[] = [];

  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    pushBits(bits, byte, 8);
  }

  const totalDataBits = totalDataCodewords * 8;
  const terminatorLen = Math.min(4, totalDataBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(totalDataCodewords);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | (bits[i + b] ?? 0);
    }
    codewords[byteIdx++] = val;
  }

  let padToggle = 0;
  while (byteIdx < totalDataCodewords) {
    codewords[byteIdx++] = padToggle % 2 === 0 ? 0xec : 0x11;
    padToggle++;
  }
  return codewords;
}

function interleaveCodewords(bytes: Uint8Array, spec: QrEccSpec): number[] {
  const dataCodewords = encodeDataCodewords(bytes, spec);
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];

  let offset = 0;
  for (const group of spec.blocks) {
    for (let i = 0; i < group.count; i++) {
      const slice = dataCodewords.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(slice);
      eccBlocks.push(computeReedSolomonEcc(slice, spec.ecPerBlock));
    }
  }

  const finalBits: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) pushBits(finalBits, block[i]!, 8);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const block of eccBlocks) pushBits(finalBits, block[i]!, 8);
  }
  return finalBits;
}

function buildFunctionGrid(version: number, size: number) {
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  const setFn = (row: number, col: number, dark: boolean) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    modules[row]![col] = dark;
    isFunction[row]![col] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inSeparator = r === -1 || r === 7 || c === -1 || c === 7;
        const onOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const onInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFn(rr, cc, !inSeparator && (onOuter || onInner));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  for (const r of QR_ECC_M_SPECS[version]!.alignmentCenters) {
    for (const c of QR_ECC_M_SPECS[version]!.alignmentCenters) {
      if (isFunction[r]?.[c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFn(r + dr, c + dc, dark);
        }
      }
    }
  }

  setFn(size - 8, 8, true);

  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunction[8]![i] = true;
      isFunction[i]![8] = true;
    }
    if (i < 8) isFunction[8]![size - 1 - i] = true;
    if (i < 7) isFunction[size - 1 - i]![8] = true;
  }

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
    const verBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((verBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, bit);
      setFn(b, a, bit);
    }
  }

  return { modules, isFunction };
}

function writeFormatInfo(modules: boolean[][], size: number, mask: number): void {
  const data = (0b00 << 3) | (mask & 0b111);
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  const formatBits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) modules[8]![i] = ((formatBits >>> i) & 1) === 1;
  modules[8]![7] = ((formatBits >>> 6) & 1) === 1;
  modules[8]![8] = ((formatBits >>> 7) & 1) === 1;
  modules[7]![8] = ((formatBits >>> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) modules[14 - i]![8] = ((formatBits >>> i) & 1) === 1;

  for (let i = 0; i < 8; i++) modules[8]![size - 1 - i] = ((formatBits >>> i) & 1) === 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i]![8] = ((formatBits >>> i) & 1) === 1;
}

function shouldFlipMask(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function computePenalty(modules: boolean[][], size: number): number {
  let penalty = 0;
  for (let r = 0; r < size; r++) {
    let runColor = modules[r]![0]!;
    let runLen = 1;
    let colRunColor = modules[0]![r]!;
    let colRunLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r]![c] === runColor) runLen++;
      else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r]![c]!;
        runLen = 1;
      }
      if (modules[c]![r] === colRunColor) colRunLen++;
      else {
        if (colRunLen >= 5) penalty += 3 + (colRunLen - 5);
        colRunColor = modules[c]![r]!;
        colRunLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
    if (colRunLen >= 5) penalty += 3 + (colRunLen - 5);
  }

  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r]![c]) darkCount++;
      if (r < size - 1 && c < size - 1) {
        const val = modules[r]![c];
        if (
          val === modules[r]![c + 1] &&
          val === modules[r + 1]![c] &&
          val === modules[r + 1]![c + 1]
        ) {
          penalty += 3;
        }
      }
    }
  }
  penalty += Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
  return penalty;
}

export function encodeQrMatrix(value: string): QrMatrix {
  const bytes = new TextEncoder().encode(value);
  const version = selectQrVersion(bytes.length);
  const spec = QR_ECC_M_SPECS[version]!;
  const size = 17 + version * 4;
  const dataBits = interleaveCodewords(bytes, spec);
  const { modules: baseModules, isFunction } = buildFunctionGrid(version, size);

  let bitIdx = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const offset of [0, 1]) {
        const col = rightCol - offset;
        if (!isFunction[row]![col]) {
          baseModules[row]![col] = (dataBits[bitIdx++] ?? 0) === 1;
        }
      }
    }
    upward = !upward;
  }

  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((val, c) =>
        isFunction[r]![c] ? val : shouldFlipMask(mask, r, c) ? !val : val,
      ),
    );
    writeFormatInfo(candidate, size, mask);
    const penalty = computePenalty(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = candidate;
    }
  }

  return { version, size, modules: bestModules };
}
