import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZipBuffer, extractZipEntries } from "@/lib/zip";
import {
  MAX_IMPORT_UPLOAD_BYTES,
  parseUploadedMatrix,
  sanitizeUploadFileName,
  validateImportFileUpload,
} from "./import-files";

function buildRawZipWithUnsafeEntry(entryName: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(entryName, "utf8");
  const compressed = deflateRawSync(content);
  const checksum = crc32(content) >>> 0;

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(checksum, 14);
  lh.writeUInt32LE(compressed.length, 18);
  lh.writeUInt32LE(content.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(checksum, 16);
  cd.writeUInt32LE(compressed.length, 20);
  cd.writeUInt32LE(content.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42);

  const cdOffset = lh.length + nameBuf.length + compressed.length;
  const cdSize = cd.length + nameBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([lh, nameBuf, compressed, cd, nameBuf, eocd]);
}

describe("Security regression — Upload safety & ZIP/XLSX hardening", () => {
  it("enforces the 5 MB file size ceiling and rejects empty files", () => {
    expect(MAX_IMPORT_UPLOAD_BYTES).toBe(5 * 1024 * 1024);

    expect(() =>
      validateImportFileUpload({
        fileName: "empty.csv",
        buffer: Buffer.alloc(0),
      }),
    ).toThrow(/empty/i);

    const oversized = Buffer.alloc(MAX_IMPORT_UPLOAD_BYTES + 1, 0x41);
    expect(() =>
      validateImportFileUpload({
        fileName: "huge.csv",
        buffer: oversized,
      }),
    ).toThrow(/5 MB/i);
  });

  it("sanitizes uploaded filenames against directory paths and control characters", () => {
    expect(sanitizeUploadFileName("../../etc/\u0000passwd.csv")).toBe(
      "passwd.csv",
    );
    expect(sanitizeUploadFileName("C:\\fakepath\\sales-nov.xlsx")).toBe(
      "sales-nov.xlsx",
    );
  });

  it("rejects dangerous extensions, mismatched MIMEs, and spoofed magic bytes", () => {
    expect(() =>
      validateImportFileUpload({
        fileName: "payload.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg onload='alert(1)'></svg>"),
      }),
    ).toThrow();

    expect(() =>
      validateImportFileUpload({
        fileName: "disguised.csv",
        mimeType: "text/csv",
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x41, 0x42]),
      }),
    ).toThrow();

    expect(() =>
      validateImportFileUpload({
        fileName: "html-in-csv.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>"),
      }),
    ).toThrow();

    expect(() =>
      validateImportFileUpload({
        fileName: "fake-zip.csv",
        mimeType: "text/csv",
        buffer: createZipBuffer([{ name: "test.txt", content: "hello" }]),
      }),
    ).toThrow();

    expect(() =>
      validateImportFileUpload({
        fileName: "not-an-xlsx.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("date,item,qty\n2026-11-01,Rice,5\n"),
      }),
    ).toThrow();

    expect(() =>
      validateImportFileUpload({
        fileName: "binary-nul.csv",
        mimeType: "text/csv",
        buffer: Buffer.from([0x61, 0x2c, 0x00, 0x62]),
      }),
    ).toThrow();
  });

  it("accepts valid UTF-8 CSV uploads up to the safety checks", () => {
    const csv = "date,itemName,quantitySold\n2026-11-01,Rice,10\n";
    const parsed = parseUploadedMatrix({
      fileName: "sales.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    expect(parsed.format).toBe("csv");
    expect(parsed.rawRows).toHaveLength(1);
  });

  it("blocks ZIP path traversal and decompression bombs in ZIP/XLSX reader", () => {
    const traversalZip = buildRawZipWithUnsafeEntry(
      "../../evil.xml",
      Buffer.from("<bad/>"),
    );
    expect(() => extractZipEntries(traversalZip)).toThrow(/Unsafe ZIP entry/);

    // 257 tiny entries triggers MAX_ZIP_READ_ENTRIES = 256
    const tooManyEntries = Array.from({ length: 257 }, (_, idx) => ({
      name: `entry-${idx}.txt`,
      content: "x",
    }));
    const oversizedZip = createZipBuffer(tooManyEntries);
    expect(() => extractZipEntries(oversizedZip)).toThrow(/too many entries/);
  });
});
