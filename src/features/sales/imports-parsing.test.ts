import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseDelimitedMatrix } from "./csv-parser";
import { parseUploadedMatrix } from "./import-files";
import { evaluateImportPreview, resolveColumnMapping } from "./preview";
import type { TenantMenuItemOption } from "./schemas";
import {
  normalizeMatchText,
  parseFlexibleDate,
  parseSalesChannel,
} from "./value-parsers";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createMockXlsxBuffer(
  entries: Array<{ name: string; content: string }>,
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const raw = Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(raw);
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    localParts.push(local, compressed);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

const SAMPLE_ITEMS: TenantMenuItemOption[] = [
  {
    id: "item-rice",
    code: "SHM-RICE",
    name: "Rice",
    nameAr: "أرز بسمتي مندي",
    unit: "KG",
    salesUnitFactor: "1",
    active: true,
  },
  {
    id: "item-chicken",
    code: "SHM-CHKN",
    name: "Chicken",
    nameAr: "دجاج مشوي على الفحم",
    unit: "KG",
    salesUnitFactor: "1",
    active: true,
  },
];

describe("Data import parsing & normalization", () => {
  it("handles UTF-8 BOM, semicolon delimiter, Arabic headers, and Arabic-Indic digits", () => {
    const rawCsv = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(
        [
          "التاريخ;اسم الصنف;الكمية المباعة;قناة البيع",
          "2026-11-01;أَرُزْ بَسْمَتِي مندي;١٥.٥;صالة",
          "02/11/2026;dajaj_unknown;8;توصيل",
          "2026-11-02;SHM-CHKN;12;",
        ].join("\r\n"),
        "utf8",
      ),
    ]);

    const parsed = parseUploadedMatrix({
      fileName: "arabic-sales.csv",
      buffer: rawCsv,
    });

    expect(parsed.format).toBe("csv");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual([
      "التاريخ",
      "اسم الصنف",
      "الكمية المباعة",
      "قناة البيع",
    ]);

    const mapping = resolveColumnMapping(parsed.headers, "SALES");
    expect(mapping).toEqual({
      date: "التاريخ",
      item: "اسم الصنف",
      quantity: "الكمية المباعة",
      channel: "قناة البيع",
      cost: undefined,
    });

    const preview = evaluateImportPreview({
      type: "SALES",
      headers: parsed.headers,
      rawRows: parsed.rawRows,
      mapping,
      menuItems: SAMPLE_ITEMS,
    });

    expect(preview.validCount).toBe(2);
    expect(preview.rejectedCount).toBe(1);
    expect(preview.validRows[0]?.channel).toBe("DINE_IN");
    expect(preview.validRows[0]?.quantity).toBe("15.5");
    expect(preview.validRows[1]?.channel).toBe("UNSPECIFIED");
    expect(preview.unmatchedItems).toEqual([
      { rawName: "dajaj_unknown", rowCount: 1, selectedAction: "" },
    ]);
  });

  it("parses YYYY-MM-DD, DD/MM/YYYY, and Excel date serials while rejecting bad dates", () => {
    expect(parseFlexibleDate("2026-11-05")?.toISOString()).toBe(
      "2026-11-05T00:00:00.000Z",
    );
    expect(parseFlexibleDate("05/11/2026")?.toISOString()).toBe(
      "2026-11-05T00:00:00.000Z",
    );
    expect(parseFlexibleDate("45678")?.toISOString()).toBe(
      "2025-01-21T00:00:00.000Z",
    );
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("invalid-date")).toBeNull();
  });

  it("normalizes case, diacritics, and Arabic variants cleanly", () => {
    expect(normalizeMatchText("أَرُزْ بَسْمَتِي")).toBe(
      normalizeMatchText("ارز بسمتي"),
    );
    expect(normalizeMatchText("  RiCe  ")).toBe("rice");
    expect(parseSalesChannel("")).toBe("UNSPECIFIED");
    expect(parseSalesChannel("توصيل")).toBe("DELIVERY");
    expect(parseSalesChannel("INVALID_CH")).toBeNull();
  });

  it("parses genuine compressed XLSX files with sharedStrings and Excel serial dates", () => {
    const xlsxBuffer = createMockXlsxBuffer([
      {
        name: "xl/workbook.xml",
        content: `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      {
        name: "xl/sharedStrings.xml",
        content: `<sst><si><t>date</t></si><si><t>itemName</t></si><si><t>quantitySold</t></si><si><t>Rice</t></si></sst>`,
      },
      {
        name: "xl/worksheets/sheet1.xml",
        content: `<worksheet><sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
          <row r="2"><c r="A2"><v>45678</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>24.5</v></c></row>
        </sheetData></worksheet>`,
      },
    ]);

    const parsed = parseUploadedMatrix({
      fileName: "pos-export.xlsx",
      buffer: xlsxBuffer,
    });

    expect(parsed.format).toBe("xlsx");
    expect(parsed.headers).toEqual(["date", "itemName", "quantitySold"]);
    expect(parsed.rawRows).toEqual([["45678", "Rice", "24.5"]]);
  });

  it("enforces the >50% invalid threshold", () => {
    const csv = [
      "date,itemName,quantitySold",
      "bad-date,Rice,10",
      "2026-11-01,Rice,-4",
      "2026-11-01,Rice,12",
    ].join("\n");
    const parsed = parseDelimitedMatrix(csv);
    const preview = evaluateImportPreview({
      type: "SALES",
      headers: parsed.rows[0]!,
      rawRows: parsed.rows.slice(1),
      mapping: resolveColumnMapping(parsed.rows[0]!, "SALES"),
      menuItems: SAMPLE_ITEMS,
    });

    expect(preview.rejectedCount).toBe(2);
    expect(preview.validCount).toBe(1);
    expect(preview.overRejectionThreshold).toBe(true);
    expect(preview.canConfirm).toBe(false);
    expect(preview.rejectedRows[0]?.reasons).toContain("badDate");
    expect(preview.rejectedRows[1]?.reasons).toContain("negativeQuantity");
  });
});
