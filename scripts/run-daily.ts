import { runDailyCronJob } from "@/features/notifications";
import { platformAdminDb } from "@/lib/tenant";
import {
  assertNonProductionScript,
  loadDevEnvFile,
  parseCliDateArg,
} from "./dev-env";

async function main() {
  assertNonProductionScript("scripts/run-daily.ts");
  loadDevEnvFile();

  const now = parseCliDateArg(process.argv[2]);
  const summary = await runDailyCronJob(now);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to run daily cron job:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformAdminDb.$disconnect();
  });
