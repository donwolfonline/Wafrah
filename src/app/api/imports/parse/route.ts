import { NextResponse } from "next/server";
import { z } from "zod";
import { handleImportRouteError } from "@/features/sales/api-errors";
import {
  MAX_IMPORT_UPLOAD_BYTES,
  sanitizeUploadFileName,
  validateImportFileUpload,
} from "@/features/sales/import-files";
import {
  ColumnMappingSchema,
  ImportTypeSchema,
  ItemOverrideMapSchema,
} from "@/features/sales/schemas";
import {
  ImportInputError,
  parseUploadedMatrix,
  previewImportForTenant,
} from "@/features/sales/service";
import {
  buildApiRateLimitKey,
  checkImportUploadRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { requireRole } from "@/lib/authz";

const MULTIPART_ENVELOPE_OVERHEAD_BYTES = 256 * 1024;

const FormTypeSchema = z.object({
  type: ImportTypeSchema,
});

function checkDeclaredContentLength(
  request: Request,
  maxBytes: number,
  message: string,
): void {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > maxBytes) {
    throw new ImportInputError(message, 413);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("sales.import");
    const ip = extractClientIpFromHeaders(request.headers);
    const rate = checkImportUploadRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip,
        scope: "imports-parse",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      checkDeclaredContentLength(
        request,
        MAX_IMPORT_UPLOAD_BYTES + MULTIPART_ENVELOPE_OVERHEAD_BYTES,
        "Uploaded file exceeds 5 MB limit",
      );

      const formData = await request.formData();
      const rawType = formData.get("type");
      const rawFile = formData.get("file");
      const rawText = formData.get("text");
      const rawFileName = formData.get("fileName");
      const rawMapping = formData.get("mapping");
      const rawOverrides = formData.get("itemOverrides");

      const { type } = FormTypeSchema.parse({ type: rawType });

      let fileName =
        typeof rawFileName === "string" && rawFileName.trim()
          ? sanitizeUploadFileName(rawFileName)
          : "pasted-data.csv";
      let mimeType: string | undefined;
      let buffer: Buffer;

      if (rawFile instanceof File) {
        if (rawFile.size === 0) {
          throw new ImportInputError("Uploaded file is empty", 400);
        }
        if (rawFile.size > MAX_IMPORT_UPLOAD_BYTES) {
          throw new ImportInputError("Uploaded file exceeds 5 MB limit", 413);
        }
        fileName = sanitizeUploadFileName(rawFile.name || fileName);
        mimeType = rawFile.type || undefined;
        buffer = Buffer.from(await rawFile.arrayBuffer());
      } else if (typeof rawText === "string" && rawText.trim().length > 0) {
        buffer = Buffer.from(rawText, "utf8");
        if (buffer.length > MAX_IMPORT_UPLOAD_BYTES) {
          throw new ImportInputError("Pasted data exceeds 5 MB limit", 413);
        }
      } else {
        throw new ImportInputError(
          "Please attach a CSV/XLSX file or paste CSV data",
          400,
        );
      }

      const validated = validateImportFileUpload({
        fileName,
        mimeType,
        buffer,
      });

      const parsedMatrix = parseUploadedMatrix({
        fileName: validated.sanitizedFileName,
        mimeType,
        buffer,
      });
      const mapping =
        typeof rawMapping === "string" && rawMapping.trim()
          ? ColumnMappingSchema.parse(JSON.parse(rawMapping))
          : undefined;
      const itemOverrides =
        typeof rawOverrides === "string" && rawOverrides.trim()
          ? ItemOverrideMapSchema.parse(JSON.parse(rawOverrides))
          : undefined;

      const previewPayload = await previewImportForTenant(
        {
          type,
          fileName: validated.sanitizedFileName,
          headers: parsedMatrix.headers,
          rawRows: parsedMatrix.rawRows,
          delimiter: parsedMatrix.delimiter,
          mapping,
          itemOverrides,
        },
        user,
      );

      return NextResponse.json({
        format: parsedMatrix.format,
        ...previewPayload,
      });
    }

    checkDeclaredContentLength(
      request,
      MAX_IMPORT_UPLOAD_BYTES,
      "Request payload exceeds 5 MB limit",
    );
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_IMPORT_UPLOAD_BYTES) {
      throw new ImportInputError("Request payload exceeds 5 MB limit", 413);
    }
    const body: unknown = JSON.parse(rawBody);
    const previewPayload = await previewImportForTenant(body, user);
    return NextResponse.json({
      format: "csv",
      ...previewPayload,
    });
  } catch (error) {
    return handleImportRouteError(error);
  }
}
