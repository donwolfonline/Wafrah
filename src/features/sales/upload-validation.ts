export const MAX_IMPORT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TEXT_EXTENSIONS = new Set([".csv", ".tsv", ".txt"]);
const ALLOWED_XLSX_EXTENSIONS = new Set([".xlsx"]);

const ALLOWED_TEXT_MIME_TYPES = new Set([
  "text/csv",
  "text/plain",
  "text/tab-separated-values",
  "application/csv",
  "application/vnd.ms-excel",
]);

const ALLOWED_XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
]);

export class ImportInputError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ImportInputError";
    this.statusCode = statusCode;
  }
}

export function sanitizeUploadFileName(rawName: string): string {
  const baseName = rawName.split(/[/\\]/).pop() ?? "";
  const cleaned = baseName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || "upload.csv";
}

function getFileExtension(fileName: string): string | null {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0 || idx === fileName.length - 1) {
    return null;
  }
  return fileName.slice(idx).toLowerCase();
}

function hasZipSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06))
  );
}

function hasUtf16Bom(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  return (
    (buffer[0] === 0xff && buffer[1] === 0xfe) ||
    (buffer[0] === 0xfe && buffer[1] === 0xff)
  );
}

function hasDangerousMagicBytes(buffer: Buffer): boolean {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return true; // PE / MZ
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return true; // ELF
  }
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return true;
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true; // PNG
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return true; // JPEG
  }
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return true;
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) return true; // #!

  const head = buffer
    .subarray(0, 256)
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<svg") ||
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<script")
  );
}

export function validateImportFileUpload(params: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): {
  sanitizedFileName: string;
  kind: "csv" | "xlsx";
} {
  const sanitizedFileName = sanitizeUploadFileName(params.fileName);
  const { buffer } = params;

  if (buffer.length === 0) {
    throw new ImportInputError("Uploaded file is empty", 400);
  }
  if (buffer.length > MAX_IMPORT_UPLOAD_BYTES) {
    throw new ImportInputError("Uploaded file exceeds 5 MB limit", 413);
  }
  if (hasDangerousMagicBytes(buffer)) {
    throw new ImportInputError(
      "Unsupported or potentially unsafe file signature",
      400,
    );
  }

  const ext = getFileExtension(sanitizedFileName);
  const normalizedMime = params.mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const isZip = hasZipSignature(buffer);

  if (ext !== null) {
    const isAllowedTextExt = ALLOWED_TEXT_EXTENSIONS.has(ext);
    const isAllowedXlsxExt = ALLOWED_XLSX_EXTENSIONS.has(ext);
    if (!isAllowedTextExt && !isAllowedXlsxExt) {
      throw new ImportInputError(
        "Only CSV, TSV, TXT, and XLSX files are supported",
        400,
      );
    }

    if (normalizedMime && normalizedMime !== "application/octet-stream") {
      if (isAllowedXlsxExt && !ALLOWED_XLSX_MIME_TYPES.has(normalizedMime)) {
        throw new ImportInputError("File MIME type does not match XLSX", 400);
      }
      if (isAllowedTextExt && !ALLOWED_TEXT_MIME_TYPES.has(normalizedMime)) {
        throw new ImportInputError("File MIME type does not match CSV/text", 400);
      }
    }

    if (isAllowedXlsxExt) {
      if (!isZip) {
        throw new ImportInputError("Invalid XLSX file header", 400);
      }
      return { sanitizedFileName, kind: "xlsx" };
    }

    if (isZip) {
      throw new ImportInputError(
        "File extension indicates CSV/text, but content is a ZIP archive",
        400,
      );
    }
    if (!hasUtf16Bom(buffer) && buffer.includes(0x00)) {
      throw new ImportInputError("CSV/text upload contains binary null bytes", 400);
    }
    return { sanitizedFileName, kind: "csv" };
  }

  if (
    normalizedMime &&
    normalizedMime !== "application/octet-stream" &&
    !ALLOWED_TEXT_MIME_TYPES.has(normalizedMime) &&
    !ALLOWED_XLSX_MIME_TYPES.has(normalizedMime)
  ) {
    throw new ImportInputError("Unsupported upload MIME type", 400);
  }

  if (isZip) {
    return { sanitizedFileName, kind: "xlsx" };
  }
  if (!hasUtf16Bom(buffer) && buffer.includes(0x00)) {
    throw new ImportInputError("CSV/text upload contains binary null bytes", 400);
  }
  return { sanitizedFileName, kind: "csv" };
}
