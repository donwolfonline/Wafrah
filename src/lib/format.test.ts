import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatGregorianDate,
  formatHijriDate,
  formatNumber,
  toWesternDigits,
} from "./format";

describe("Intl number, currency, and date formatting (ar-SA & en-US)", () => {
  it("normalizes Eastern Arabic and Extended Arabic digits to Western 0-9", () => {
    expect(toWesternDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
    expect(toWesternDigits("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
  });

  it("formats numbers using Western digits (0-9) in both ar and en", () => {
    const decimalQty = new Prisma.Decimal("1245.75");
    const arFormatted = formatNumber(decimalQty, "ar", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const enFormatted = formatNumber(decimalQty, "en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    expect(arFormatted).toContain("1");
    expect(arFormatted).toContain("245");
    expect(arFormatted).toContain("75");
    expect(arFormatted).not.toMatch(/[٠-٩]/);
    expect(enFormatted).toBe("1,245.75");
  });

  it("formats SAR currency deterministically across runtimes with Western digits in both ar and en", () => {
    const cost = new Prisma.Decimal("385.50");
    const arCurrency = formatCurrency(cost, "ar");
    const enCurrency = formatCurrency(cost, "en");

    expect(arCurrency).toBe("385.50\u00A0ر.س");
    expect(arCurrency).not.toMatch(/[٠-٩]/);
    expect(arCurrency).not.toMatch(/[\u200E\u200F\u20C1]/);
    expect(enCurrency).toBe("SAR\u00A0385.50");

    expect(formatCurrency("-18.50", "ar")).toBe("-18.50\u00A0ر.س");
    expect(formatCurrency(-0, "en")).toBe("SAR\u00A00.00");
    expect(formatCurrency("18.00", "ar", { currencyDisplay: "code" })).toBe(
      "18.00\u00A0SAR",
    );
  });

  it("formats Gregorian and islamic-umalqura Hijri dates in Asia/Riyadh with Western digits", () => {
    const sampleUtc = new Date("2026-03-01T21:30:00.000Z"); // 2026-03-02 00:30 in Asia/Riyadh

    const gregorianAr = formatGregorianDate(sampleUtc, "ar");
    const gregorianEn = formatGregorianDate(sampleUtc, "en");
    const hijriAr = formatHijriDate(sampleUtc, "ar");
    const hijriEn = formatHijriDate(sampleUtc, "en");

    expect(gregorianAr).toContain("2026");
    expect(gregorianAr).not.toMatch(/[٠-٩\u060C]/);
    expect(gregorianEn).toContain("Mar 2, 2026");

    expect(hijriAr).toContain("1447");
    expect(hijriAr).not.toMatch(/[٠-٩\u060C]/);
    expect(hijriEn).toContain("1447");

    const withTimeAr = formatGregorianDate(sampleUtc, "ar", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(withTimeAr).toBe("2 مارس 2026 · 12:30 ص");

    const withHijri = formatDate(sampleUtc, "ar", { includeHijri: true });
    expect(withHijri.hijri).toBeTruthy();
    expect(withHijri.combined).toContain(withHijri.gregorian);
    expect(withHijri.combined).toContain(withHijri.hijri ?? "");
  });
});
