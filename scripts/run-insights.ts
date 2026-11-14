import { runInsightsForAllTenants } from "@/features/insights";
import { platformAdminDb } from "@/lib/tenant";
import {
  assertNonProductionScript,
  loadDevEnvFile,
  parseCliDateArg,
} from "./dev-env";

async function main() {
  assertNonProductionScript("scripts/run-insights.ts");
  loadDevEnvFile();

  const now = parseCliDateArg(process.argv[2]);
  const summary = await runInsightsForAllTenants(now);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to run insights:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformAdminDb.$disconnect();
  });
