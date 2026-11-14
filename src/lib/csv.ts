const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/;

export type CsvCellValue = string | number | boolean | null | undefined;

export interface EscapeCsvOptions {
  /** Guard cells starting with =, +, -, or @ against spreadsheet formula injection. Defaults to true. */
  formulaSafe?: boolean;
  /** Also wrap cells containing semicolons in double quotes (used when exporting reason lists). */
  quoteSemicolon?: boolean;
}

/**
 * Escapes a single CSV cell with optional spreadsheet-formula neutralization
 * (prefixing leading `=`, `+`, `-`, or `@` with a single quote) and RFC-4180 quoting.
 */
export function escapeCsvCell(
  rawValue: CsvCellValue,
  options: EscapeCsvOptions = {},
): string {
  if (rawValue === null || rawValue === undefined) {
    return "";
  }
  const { formulaSafe = true, quoteSemicolon = false } = options;
  const str = String(rawValue);
  const neutralized =
    formulaSafe && FORMULA_PREFIX_PATTERN.test(str) ? `'${str}` : str;
  const needsQuote = quoteSemicolon
    ? /[",\r\n;]/
    : /[",\r\n]/;

  if (needsQuote.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/**
 * Serializes headers and rows into a UTF-8 BOM-prefixed CRLF CSV string
 * for clean Arabic/English Excel compatibility.
 */
export function buildCsvString(
  headers: readonly string[],
  rows: ReadonlyArray<readonly CsvCellValue[]>,
  options: EscapeCsvOptions = {},
): string {
  const headerLine = headers.map((cell) => escapeCsvCell(cell, options)).join(",");
  const dataLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell, options)).join(","),
  );
  return `\uFEFF${[headerLine, ...dataLines].join("\r\n")}\r\n`;
}
