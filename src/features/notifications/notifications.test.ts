import { describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";
import {
  filterRecipientsByPreference,
  renderCriticalAlertEmail,
  renderMonthlyReportEmail,
  renderWeeklySummaryEmail,
  renderWelcomeEmail,
  resolvePreviousMonthKey,
} from "./index";

describe("sendEmail wrapper", () => {
  it("logs formatted email previews in non-production when RESEND_API_KEY is missing or placeholder", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_replace_with_api_key";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const result = await sendEmail(
        "manager@shami.sa",
        "Test Alert",
        '<html dir="rtl"><body><p>Hello</p></body></html>',
        "Plain text body",
      );

      expect(result.ok).toBe(true);
      expect(result.mode).toBe("console");
      expect(result.id).toMatch(/^dev-console-/);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0]?.[0]).toContain("[WAFRAH DEV EMAIL]");
      expect(infoSpy.mock.calls[0]?.[0]).toContain("manager@shami.sa");
      expect(infoSpy.mock.calls[0]?.[0]).toContain("Plain text body");
    } finally {
      infoSpy.mockRestore();
      process.env.RESEND_API_KEY = prevKey;
    }
  });

  it("posts JSON payload to Resend REST API when an API key is provided", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "re_email_abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await sendEmail(
      ["owner@shami.sa"],
      "Wafrah Report",
      "<p>Report</p>",
      "Report",
      {
        apiKey: "re_live_test_key",
        from: "Wafrah <noreply@wafrah.sa>",
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );

    expect(result).toEqual({
      ok: true,
      mode: "resend",
      id: "re_email_abc123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_live_test_key",
    });
  });

  it("returns ok=false when no valid recipients are supplied", async () => {
    const result = await sendEmail(["   "], "Empty", "<p>x</p>", "x");
    expect(result.ok).toBe(false);
  });
});

describe("notification templates (AR RTL & EN LTR + plain text)", () => {
  it("renders critical alert email in Arabic RTL and English LTR with brand palette and XSS escaping", () => {
    const ar = renderCriticalAlertEmail({
      locale: "ar",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي <script>alert(1)</script>",
      dateKey: "2026-11-12",
      alerts: [
        {
          id: "alert-1",
          severity: "CRITICAL",
          messageKey: "insights.alerts.wasteSpike",
          messageParams: {
            itemName: "Basmati Rice",
            itemNameAr: "أرز بسمتي",
            observedSar: "320.00",
            baselineSar: "60.00",
            pctChange: "433%",
          },
          createdAtIso: "2026-11-12T23:55:00.000Z",
        },
      ],
      appUrl: "https://wafrah.sa",
    });

    expect(ar.html).toContain('lang="ar" dir="rtl"');
    expect(ar.html).toContain("#0F4C45");
    expect(ar.html).toContain("#C89B3C");
    expect(ar.html).toContain("أرز بسمتي");
    expect(ar.html).toContain("https://wafrah.sa/dashboard");
    expect(ar.html).not.toContain("<script>alert(1)</script>");
    expect(ar.text).toContain("أرز بسمتي");
    expect(ar.text).toContain("https://wafrah.sa/dashboard");

    const en = renderCriticalAlertEmail({
      locale: "en",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي",
      dateKey: "2026-11-12",
      alerts: [
        {
          id: "alert-1",
          severity: "CRITICAL",
          messageKey: "insights.alerts.wasteSpike",
          messageParams: {
            itemName: "Basmati Rice",
            itemNameAr: "أرز بسمتي",
            observedSar: "320.00",
            baselineSar: "60.00",
            pctChange: "433%",
          },
          createdAtIso: "2026-11-12T23:55:00.000Z",
        },
      ],
      appUrl: "https://wafrah.sa",
    });

    expect(en.html).toContain('lang="en" dir="ltr"');
    expect(en.subject).toContain("Al Shami Gourmet");
    expect(en.text).toContain("Basmati Rice");
  });

  it("renders weekly summary email with localized item names and 7-day horizon", () => {
    const ar = renderWeeklySummaryEmail({
      locale: "ar",
      restaurantName: "Al Diwan Kitchen",
      restaurantNameAr: "مطبخ الديوان",
      horizonStart: "2026-11-15",
      horizonEnd: "2026-11-21",
      last7dWasteSar: "640.50",
      totalForecastedItems: 12,
      topRecommendations: [
        {
          itemName: "Lamb Kabsa",
          itemNameAr: "كبسة لحم",
          unit: "PORTION",
          totalRecommendedQty: "420.0",
          dailyAvgQty: "60.0",
        },
      ],
      appUrl: "https://wafrah.sa",
    });

    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain("كبسة لحم");
    expect(ar.text).toContain("نوفمبر");
    expect(ar.text).toContain("640.50");

    const en = renderWeeklySummaryEmail({
      locale: "en",
      restaurantName: "Al Diwan Kitchen",
      restaurantNameAr: "مطبخ الديوان",
      horizonStart: "2026-11-15",
      horizonEnd: "2026-11-21",
      last7dWasteSar: "640.50",
      totalForecastedItems: 12,
      topRecommendations: [
        {
          itemName: "Lamb Kabsa",
          itemNameAr: "كبسة لحم",
          unit: "PORTION",
          totalRecommendedQty: "420.0",
          dailyAvgQty: "60.0",
        },
      ],
      appUrl: "https://wafrah.sa",
    });

    expect(en.html).toContain('dir="ltr"');
    expect(en.html).toContain("Lamb Kabsa");
  });

  it("renders monthly report email honestly for SAVED, INCREASED, and CALIBRATING states", () => {
    const saved = renderMonthlyReportEmail({
      locale: "en",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي",
      yearMonth: "2026-10",
      outcome: "SAVED",
      headlineAmountSar: "1450.00",
      calibratingDaysLeft: 0,
      totalWasteSar: "2100.00",
      appUrl: "https://wafrah.sa",
    });
    expect(saved.html).toContain("https://wafrah.sa/reports/2026-10");
    expect(saved.html).toContain("1,450.00");

    const increased = renderMonthlyReportEmail({
      locale: "ar",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي",
      yearMonth: "2026-10",
      outcome: "INCREASED",
      headlineAmountSar: "320.00",
      calibratingDaysLeft: 0,
      totalWasteSar: "2900.00",
      appUrl: "https://wafrah.sa",
    });
    expect(increased.html).toContain('dir="rtl"');
    expect(increased.text).toContain("320.00");
    expect(increased.text).toContain("2,900.00");
    expect(increased.text).toContain("ارتفع الهدر");

    const calibrating = renderMonthlyReportEmail({
      locale: "en",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي",
      yearMonth: "2026-10",
      outcome: "CALIBRATING",
      headlineAmountSar: "0.00",
      calibratingDaysLeft: 5,
      totalWasteSar: "500.00",
      appUrl: "https://wafrah.sa",
    });
    expect(calibrating.text.toLowerCase()).toContain("5");
  });

  it("renders welcome email in AR and EN with branch code and login link", () => {
    const ar = renderWelcomeEmail({
      locale: "ar",
      recipientName: "طارق الشامي",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي",
      branchCode: "SHAMI-JED",
      role: "MANAGER",
      appUrl: "https://wafrah.sa",
    });
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain("SHAMI-JED");
    expect(ar.text).toContain("https://wafrah.sa/login");

    const en = renderWelcomeEmail({
      locale: "en",
      recipientName: "Tariq Al-Shami",
      restaurantName: "Al Shami Gourmet",
      restaurantNameAr: "مطعم الشامي",
      branchCode: "SHAMI-JED",
      role: "OWNER",
      appUrl: "https://wafrah.sa",
    });
    expect(en.html).toContain('dir="ltr"');
    expect(en.html).toContain("Tariq Al-Shami");
  });
});

describe("preference filtering and date helpers", () => {
  it("treats missing preferences as enabled, honors opt-outs, and skips blank emails", () => {
    const filtered = filterRecipientsByPreference(
      [
        {
          userId: "u1",
          name: "Default On",
          email: "u1@shami.sa",
          role: "MANAGER",
          locale: "ar",
          preference: null,
        },
        {
          userId: "u2",
          name: "Opted Out Critical",
          email: "u2@shami.sa",
          role: "OWNER",
          locale: "en",
          preference: {
            criticalAlerts: false,
            weeklySummary: true,
            monthlyReport: true,
          },
        },
        {
          userId: "u3",
          name: "No Email",
          email: null,
          role: "MANAGER",
          locale: "ar",
          preference: null,
        },
      ],
      "criticalAlerts",
    );

    expect(filtered.map((r) => r.userId)).toEqual(["u1"]);
  });

  it("resolves previous Riyadh month across year boundaries", () => {
    expect(resolvePreviousMonthKey("2026-01-01")).toBe("2025-12");
    expect(resolvePreviousMonthKey("2026-11-01")).toBe("2026-10");
  });
});
