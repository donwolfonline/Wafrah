import { escapeCsvCell as escapeFormulaSafeCsvCell } from "@/lib/csv";
import { stripBom } from "./value-parsers";

export type SupportedDelimiter = "," | ";" | "\t" | "|";

export {
  formatUtcDateKey,
  normalizeDigits,
  normalizeMatchText,
  parseFlexibleDate,
  parseNonNegativeDecimal,
  parseSalesChannel,
  stripBom,
} from "./value-parsers";

export function decodeUploadedTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripBom(buffer.subarray(2).toString("utf16le"));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return stripBom(swapped.toString("utf16le"));
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return stripBom(buffer.subarray(3).toString("utf8"));
  }
  return stripBom(buffer.toString("utf8"));
}

export function detectDelimiter(text: string): SupportedDelimiter {
  const cleaned = stripBom(text);
  const candidates: SupportedDelimiter[] = [",", ";", "\t", "|"];
  const counts: Record<SupportedDelimiter, number[]> = {
    ",": [],
    ";": [],
    "\t": [],
    "|": [],
  };

  let inQuotes = false;
  let lineCount = 0;
  let lineHasContent = false;
  const lineTotals: Record<SupportedDelimiter, number> = {
    ",": 0,
    ";": 0,
    "\t": 0,
    "|": 0,
  };

  for (let i = 0; i < cleaned.length && lineCount < 10; i++) {
    const ch = cleaned[i];
    if (ch === '"') {
      if (inQuotes && cleaned[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      lineHasContent = true;
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && cleaned[i + 1] === "\n") {
        i++;
      }
      if (lineHasContent) {
        for (const delim of candidates) {
          counts[delim].push(lineTotals[delim]);
          lineTotals[delim] = 0;
        }
        lineCount++;
        lineHasContent = false;
      }
      continue;
    }

    lineHasContent = true;
    if (!inQuotes && (ch === "," || ch === ";" || ch === "\t" || ch === "|")) {
      lineTotals[ch]++;
    }
  }

  if (lineHasContent && lineCount < 10) {
    for (const delim of candidates) {
      counts[delim].push(lineTotals[delim]);
    }
  }

  let bestDelim: SupportedDelimiter = ",";
  let bestScore = 0;

  for (const delim of candidates) {
    const series = counts[delim];
    if (series.length === 0) continue;
    if (series.every((n) => n === 0)) continue;
    const sum = series.reduce((acc, n) => acc + n, 0);
    const first = series[0] ?? 0;
    const consistent = first > 0 && series.every((n) => n === first);
    const score = sum + (consistent ? 1000 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

export function parseDelimitedMatrix(
  rawText: string,
  explicitDelimiter?: SupportedDelimiter,
): { delimiter: SupportedDelimiter; rows: string[][] } {
  const text = stripBom(rawText);
  const delimiter = explicitDelimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += ch;
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const normalizedRows = rows.map((r) => {
    const padded = [...r];
    while (padded.length < maxCols) {
      padded.push("");
    }
    return padded;
  });

  return { delimiter, rows: normalizedRows };
}

export function escapeCsvCell(value: string): string {
  return escapeFormulaSafeCsvCell(value, {
    formulaSafe: true,
    quoteSemicolon: true,
  });
}
