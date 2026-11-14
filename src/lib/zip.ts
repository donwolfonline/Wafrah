import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipInputEntry {
  name: string;
  content: string | Buffer;
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const MAX_ZIP_READ_ENTRIES = 256;
const MAX_ZIP_READ_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_READ_TOTAL_BYTES = 50 * 1024 * 1024;

function normalizeZipEntryName(rawName: string): string {
  const cleaned = rawName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.split("/").some((segment) => segment === "..")) {
    throw new Error(`Unsafe ZIP entry path: "${rawName}"`);
  }
  return cleaned;
}

function encodeDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Creates a standard PKZIP archive buffer from in-memory entries using Node's
 * built-in zlib (deflate + CRC-32), avoiding third-party archive dependencies.
 */
export function createZipBuffer(
  entries: ReadonlyArray<ZipInputEntry>,
  timestamp: Date = new Date(),
): Buffer {
  const { dosTime, dosDate } = encodeDosTimeDate(timestamp);
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const safeName = normalizeZipEntryName(entry.name);
    const nameBuf = Buffer.from(safeName, "utf8");
    const rawBuf =
      typeof entry.content === "string"
        ? Buffer.from(entry.content, "utf8")
        : entry.content;

    const compressedBuf = deflateRawSync(rawBuf);
    const checksum = crc32(rawBuf) >>> 0;

    // 30-byte Local File Header + filename
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // Deflate compression
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, compressedBuf);

    // 46-byte Central Directory Header + filename
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(8, 10); // Deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressedBuf.length;
  }

  const centralSize = centralChunks.reduce((acc, buf) => acc + buf.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

function findEocdOffset(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) {
      return offset;
    }
  }
  throw new Error("Invalid ZIP archive: End of Central Directory not found");
}

/**
 * Safely reads a PKZIP buffer into a Map of entry names -> uncompressed Buffers,
 * rejecting path traversal, oversized entry counts, and decompression bombs.
 */
export function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  if (buffer.length < 22) {
    throw new Error("Invalid ZIP archive: file too small");
  }

  const eocdOffset = findEocdOffset(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirEnd = centralDirOffset + centralDirSize;

  if (totalEntries > MAX_ZIP_READ_ENTRIES) {
    throw new Error("Invalid ZIP archive: too many entries");
  }
  if (centralDirOffset > buffer.length || centralDirEnd > buffer.length) {
    throw new Error("Invalid ZIP archive: truncated central directory");
  }

  const files = new Map<string, Buffer>();
  let cursor = centralDirOffset;
  let totalBytes = 0;

  while (cursor + 46 <= centralDirEnd) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIR_HEADER_SIG) {
      break;
    }
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > centralDirEnd) {
      throw new Error("Invalid ZIP archive: corrupt entry name");
    }
    const rawName = buffer.subarray(cursor + 46, nameEnd).toString("utf8");
    const safeName = normalizeZipEntryName(rawName);

    if (uncompressedSize > MAX_ZIP_READ_ENTRY_BYTES) {
      throw new Error(`Invalid ZIP archive: entry "${safeName}" too large`);
    }

    if (
      localHeaderOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIG
    ) {
      throw new Error(`Invalid ZIP archive: corrupt entry "${safeName}"`);
    }
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length || dataStart < 0) {
      throw new Error(`Invalid ZIP archive: truncated entry "${safeName}"`);
    }

    const rawSlice = buffer.subarray(dataStart, dataEnd);
    let output: Buffer;
    if (compressionMethod === 0) {
      if (rawSlice.length > MAX_ZIP_READ_ENTRY_BYTES) {
        throw new Error(`Invalid ZIP archive: entry "${safeName}" too large`);
      }
      output = rawSlice;
    } else if (compressionMethod === 8) {
      output = inflateRawSync(rawSlice, {
        maxOutputLength: MAX_ZIP_READ_ENTRY_BYTES,
      });
    } else {
      throw new Error(
        `Unsupported ZIP compression method (${compressionMethod}) for "${safeName}"`,
      );
    }

    totalBytes += output.length;
    if (totalBytes > MAX_ZIP_READ_TOTAL_BYTES || files.size >= MAX_ZIP_READ_ENTRIES) {
      throw new Error("Invalid ZIP archive: uncompressed size limit exceeded");
    }

    files.set(safeName, output);
    cursor = nameEnd + extraLength + commentLength;
  }

  return files;
}
