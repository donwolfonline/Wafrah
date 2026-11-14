import { extractZipEntries } from "@/lib/zip";

// XLSX parsing delegates container extraction to src/lib/zip.ts which enforces
// entry count limits, path traversal rejection, and per-entry/total inflate caps.

function decodeXmlEntities(text: string): string {
  return text
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractXmlTextTags(fragment: string): string {
  const parts: string[] = [];
  const tRegex =
    /<(?:[a-zA-Z0-9_-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?t>/g;
  let match: RegExpExecArray | null = tRegex.exec(fragment);
  while (match !== null) {
    parts.push(decodeXmlEntities(match[1] ?? ""));
    match = tRegex.exec(fragment);
  }
  return parts.join("");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRegex =
    /<(?:[a-zA-Z0-9_-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?si>/g;
  let match: RegExpExecArray | null = siRegex.exec(xml);
  while (match !== null) {
    strings.push(extractXmlTextTags(match[1] ?? ""));
    match = siRegex.exec(xml);
  }
  return strings;
}

function parseXmlAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null = attrRegex.exec(attrString);
  while (match !== null) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? "");
    match = attrRegex.exec(attrString);
  }
  return attrs;
}

function resolveFirstSheetPath(entries: Map<string, Buffer>): string {
  const workbookBuf = entries.get("xl/workbook.xml");
  const relsBuf = entries.get("xl/_rels/workbook.xml.rels");

  if (workbookBuf && relsBuf) {
    const workbookXml = workbookBuf.toString("utf8");
    const relsXml = relsBuf.toString("utf8");

    const sheetMatch =
      /<(?:[a-zA-Z0-9_-]+:)?sheet\b([^>]*)\/?>(?:<\/(?:[a-zA-Z0-9_-]+:)?sheet>)?/.exec(
        workbookXml,
      );
    if (sheetMatch) {
      const sheetAttrs = parseXmlAttributes(sheetMatch[1] ?? "");
      const relId = sheetAttrs["r:id"];
      if (relId) {
        const relRegex = /<Relationship\b([^>]*)\/?>/g;
        let relMatch: RegExpExecArray | null = relRegex.exec(relsXml);
        while (relMatch !== null) {
          const relAttrs = parseXmlAttributes(relMatch[1] ?? "");
          if (relAttrs.Id === relId && relAttrs.Target) {
            const target = relAttrs.Target.replace(/\\/g, "/").replace(/^\/+/, "");
            if (target.includes("..")) {
              throw new Error("Invalid XLSX archive: unsafe worksheet target path");
            }
            const normalized = target.startsWith("xl/")
              ? target
              : `xl/${target}`;
            if (entries.has(normalized)) {
              return normalized;
            }
          }
          relMatch = relRegex.exec(relsXml);
        }
      }
    }
  }

  for (const key of entries.keys()) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(key)) {
      return key;
    }
  }

  throw new Error("No worksheet found inside XLSX file");
}

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.toUpperCase().charCodeAt(i);
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function extractSingleValueTag(cellInner: string): string {
  const match =
    /<(?:[a-zA-Z0-9_-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?v>/.exec(
      cellInner,
    );
  return match ? decodeXmlEntities(match[1] ?? "") : "";
}

function extractInlineString(cellInner: string): string {
  const isMatch =
    /<(?:[a-zA-Z0-9_-]+:)?is\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?is>/.exec(
      cellInner,
    );
  return isMatch ? extractXmlTextTags(isMatch[1] ?? "") : "";
}

function parseWorksheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rowMap = new Map<number, string[]>();
  let maxRow = -1;
  let maxCol = 0;
  let fallbackRowIdx = 0;

  const rowRegex =
    /<(?:[a-zA-Z0-9_-]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?row>/g;
  let rowMatch: RegExpExecArray | null = rowRegex.exec(xml);

  while (rowMatch !== null) {
    const rowAttrs = parseXmlAttributes(rowMatch[1] ?? "");
    const rowIndex = rowAttrs.r
      ? Number.parseInt(rowAttrs.r, 10) - 1
      : fallbackRowIdx;
    fallbackRowIdx = rowIndex + 1;

    const cells: string[] = [];
    let fallbackColIdx = 0;
    const cellRegex =
      /<(?:[a-zA-Z0-9_-]+:)?c\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?c>)/g;
    let cellMatch: RegExpExecArray | null = cellRegex.exec(rowMatch[2] ?? "");

    while (cellMatch !== null) {
      const attrs = parseXmlAttributes(cellMatch[1] ?? "");
      const refMatch = attrs.r ? /^([A-Za-z]+)\d+$/.exec(attrs.r) : null;
      const colIndex = refMatch
        ? columnLettersToIndex(refMatch[1])
        : fallbackColIdx;
      fallbackColIdx = colIndex + 1;

      const cellInner = cellMatch[2] ?? "";
      const cellType = attrs.t ?? "n";
      let value = "";

      if (cellType === "inlineStr") {
        value = extractInlineString(cellInner);
      } else if (cellType === "s") {
        const idx = Number.parseInt(extractSingleValueTag(cellInner), 10);
        value = Number.isFinite(idx) ? (sharedStrings[idx] ?? "") : "";
      } else if (cellType === "b") {
        value = extractSingleValueTag(cellInner) === "1" ? "TRUE" : "FALSE";
      } else {
        value = extractSingleValueTag(cellInner);
      }

      cells[colIndex] = value.trim();
      if (colIndex + 1 > maxCol) {
        maxCol = colIndex + 1;
      }

      cellMatch = cellRegex.exec(rowMatch[2] ?? "");
    }

    if (cells.some((cell) => cell !== undefined && cell !== "")) {
      rowMap.set(rowIndex, cells);
      if (rowIndex > maxRow) {
        maxRow = rowIndex;
      }
    }

    rowMatch = rowRegex.exec(xml);
  }

  const matrix: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const rawCells = rowMap.get(r);
    if (!rawCells) continue;
    const normalizedRow: string[] = [];
    for (let c = 0; c < maxCol; c++) {
      normalizedRow.push(rawCells[c] ?? "");
    }
    matrix.push(normalizedRow);
  }

  return matrix;
}

export function parseXlsxBuffer(buffer: Buffer): string[][] {
  const entries = extractZipEntries(buffer);
  const sheetPath = resolveFirstSheetPath(entries);
  const sheetBuf = entries.get(sheetPath);
  if (!sheetBuf) {
    throw new Error("Worksheet XML could not be read from XLSX file");
  }
  const sharedStringsBuf = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsBuf
    ? parseSharedStrings(sharedStringsBuf.toString("utf8"))
    : [];

  return parseWorksheetRows(sheetBuf.toString("utf8"), sharedStrings);
}
