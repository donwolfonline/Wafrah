import {
  type MenuValidationErrorCode,
  menuItemInputSchema,
  type ValidatedMenuItemInput,
} from "./schemas";

export interface ValidMenuCsvRow {
  rowNumber: number;
  data: ValidatedMenuItemInput;
}

export interface InvalidMenuCsvRow {
  rowNumber: number;
  raw: {
    name: string;
    nameAr: string;
    category: string;
    unit: string;
    unitCost: string;
    shortageCost: string;
  };
  reasons: MenuValidationErrorCode[];
}

export interface MenuCsvParseResult {
  headerError: "emptyFile" | "missingRequiredColumns" | null;
  validRows: ValidMenuCsvRow[];
  invalidRows: InvalidMenuCsvRow[];
}

export function parseCsvMatrix(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if (char === "\r" && nextChar === "\n") {
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      i += 1;
    } else if (char === "\n" || char === "\r") {
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function normalizeHeaderKey(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  code: "code",
  itemcode: "code",
  name: "name",
  nameen: "name",
  englishname: "name",
  namear: "nameAr",
  arabicname: "nameAr",
  category: "category",
  unit: "unit",
  unitcost: "unitCost",
  cost: "unitCost",
  shortagecost: "shortageCost",
};

export function parseMenuItemsCsv(rawText: string): MenuCsvParseResult {
  const matrix = parseCsvMatrix(rawText);
  if (matrix.length === 0) {
    return {
      headerError: "emptyFile",
      validRows: [],
      invalidRows: [],
    };
  }

  const headerRow = matrix[0] ?? [];
  const columnMap = new Map<string, number>();

  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeaderKey(cell);
    const canonical = HEADER_ALIASES[normalized];
    if (canonical && !columnMap.has(canonical)) {
      columnMap.set(canonical, index);
    }
  });

  const hasNameCol = columnMap.has("name") || columnMap.has("nameAr");
  const hasRequiredCols =
    hasNameCol &&
    columnMap.has("category") &&
    columnMap.has("unit") &&
    columnMap.has("unitCost");

  if (!hasRequiredCols) {
    return {
      headerError: "missingRequiredColumns",
      validRows: [],
      invalidRows: [],
    };
  }

  const validRows: ValidMenuCsvRow[] = [];
  const invalidRows: InvalidMenuCsvRow[] = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const cells = matrix[rowIndex] ?? [];
    const getCell = (col: string): string => {
      const idx = columnMap.get(col);
      return idx !== undefined ? (cells[idx] ?? "").trim() : "";
    };

    const raw = {
      code: getCell("code"),
      name: getCell("name"),
      nameAr: getCell("nameAr"),
      category: getCell("category"),
      unit: getCell("unit"),
      unitCost: getCell("unitCost"),
      shortageCost: getCell("shortageCost"),
    };

    const parsed = menuItemInputSchema.safeParse(raw);
    if (parsed.success) {
      validRows.push({
        rowNumber: rowIndex + 1,
        data: parsed.data,
      });
    } else {
      const reasons = Array.from(
        new Set(
          parsed.error.issues.map(
            (issue) => issue.message as MenuValidationErrorCode,
          ),
        ),
      );
      invalidRows.push({
        rowNumber: rowIndex + 1,
        raw: {
          name: raw.name,
          nameAr: raw.nameAr,
          category: raw.category,
          unit: raw.unit,
          unitCost: raw.unitCost,
          shortageCost: raw.shortageCost,
        },
        reasons,
      });
    }
  }

  return {
    headerError: null,
    validRows,
    invalidRows,
  };
}
