import { runForecastsForAllTenants } from "@/features/forecast";
import { platformAdminDb } from "@/lib/tenant";
import {
  assertNonProductionScript,
  loadDevEnvFile,
  parseCliDateArg,
} from "./dev-env";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

async function main() {
  assertNonProductionScript("scripts/run-forecast.ts");
  loadDevEnvFile();

  const now = parseCliDateArg(process.argv[2]);
  const summary = await runForecastsForAllTenants(now);

  console.log(
    `\nForecast Run (${summary.evaluatedAt}) — ${summary.tenantCount} tenants, ${summary.totalPersistedRows} rows saved`,
  );

  for (const tenant of summary.tenants) {
    console.log(
      `\n=== ${tenant.tenantCode} (${tenant.tenantName}) | History <= ${tenant.historyEndDate ?? "N/A"} | Horizon ${tenant.forecastStartDate ?? "N/A"}..${tenant.forecastEndDate ?? "N/A"} | Persisted: ${tenant.persistedRows} | WAPE: ${tenant.accuracy.overallWapePct ?? "N/A"}% (${tenant.accuracy.totalMatchedPairs} pairs) ===`,
    );

    const rows = tenant.output.items.flatMap((item) =>
      item.days.map((day) => ({
        code: day.itemCode ?? item.menuItemId,
        item: day.itemName,
        date: day.forDate,
        weekday: WEEKDAY_NAMES[day.weekday] ?? String(day.weekday),
        unit: day.unit,
        mean: day.meanQty ?? "INSUFFICIENT_DATA",
        range:
          day.lowQty !== null && day.highQty !== null
            ? `${day.lowQty} – ${day.highQty}`
            : "N/A",
        recommended: day.recommendedQty ?? "N/A",
        cr: day.criticalRatio,
      })),
    );

    console.table(rows);
  }
}

main()
  .catch((error) => {
    console.error("Failed to run forecasts:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformAdminDb.$disconnect();
  });
