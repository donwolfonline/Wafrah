import type { ImportType } from "@prisma/client";
import {
  decodeUploadedTextBuffer,
  parseDelimitedMatrix,
  type SupportedDelimiter,
} from "./csv-parser";
import {
  ImportInputError,
  MAX_IMPORT_UPLOAD_BYTES,
  sanitizeUploadFileName,
  validateImportFileUpload,
} from "./upload-validation";
import { parseXlsxBuffer } from "./xlsx";

export {
  ImportInputError,
  MAX_IMPORT_UPLOAD_BYTES,
  sanitizeUploadFileName,
  validateImportFileUpload,
};

function normalizeHeaders(rawHeaders: string[]): string[] {
  const counts = new Map<string, number>();
  return rawHeaders.map((header, idx) => {
    const base = header.trim() || `Column ${idx + 1}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
}

export function parseUploadedMatrix(params: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): {
  format: "csv" | "xlsx";
  delimiter?: SupportedDelimiter;
  headers: string[];
  rawRows: string[][];
} {
  const validation = validateImportFileUpload(params);
  const { buffer } = params;

  let matrix: string[][];
  let format: "csv" | "xlsx";
  let delimiter: SupportedDelimiter | undefined;

  if (validation.kind === "xlsx") {
    try {
      matrix = parseXlsxBuffer(buffer);
      format = "xlsx";
    } catch (error) {
      throw new ImportInputError(
        error instanceof Error ? error.message : "Failed to parse XLSX file",
        400,
      );
    }
  } else {
    const text = decodeUploadedTextBuffer(buffer);
    const parsed = parseDelimitedMatrix(text);
    matrix = parsed.rows;
    delimiter = parsed.delimiter;
    format = "csv";
  }

  if (matrix.length < 2) {
    throw new ImportInputError(
      "File must contain a header row and at least one data row",
      400,
    );
  }

  const headers = normalizeHeaders(matrix[0] ?? []);
  if (headers.length === 0 || headers.length > 100) {
    throw new ImportInputError("Unsupported column count in spreadsheet", 400);
  }

  const rawRows = matrix
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => headers.map((_, idx) => (row[idx] ?? "").trim()));

  if (rawRows.length === 0) {
    throw new ImportInputError("No non-empty data rows found in file", 400);
  }

  if (rawRows.length > 10000) {
    throw new ImportInputError(
      "File exceeds maximum limit of 10,000 rows",
      400,
    );
  }

  return { format, delimiter, headers, rawRows };
}

export function buildImportTemplateCsv(
  type: ImportType,
  locale: "ar" | "en",
): string {
  const lines =
    type === "SALES"
      ? locale === "ar"
        ? [
            "التاريخ,اسم الصنف,الكمية المباعة,قناة البيع",
            "2026-11-01,أرز بسمتي مندي,42,صالة",
            "2026-11-01,دجاج مشوي على الفحم,28,توصيل",
          ]
        : [
            "date,itemName,quantitySold,channel",
            "2026-11-01,Rice,42,DINE_IN",
            "2026-11-01,Chicken,28,DELIVERY",
          ]
      : locale === "ar"
        ? [
            "التاريخ,اسم الصنف,الكمية,التكلفة",
            "2026-11-01,أرز بسمتي مندي,15.5,124.00",
            "2026-11-01,دجاج مشوي على الفحم,18,216.00",
          ]
        : [
            "date,itemName,quantity,cost",
            "2026-11-01,Rice,15.5,124.00",
            "2026-11-01,Chicken,18,216.00",
          ];

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
