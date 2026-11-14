import { platformAdminDb } from "../src/lib/db";
import { bootstrapProductionAdmin } from "../src/lib/seed-prod-config";

async function main() {
  try {
    const result = await bootstrapProductionAdmin(platformAdminDb, process.env);
    console.log(
      JSON.stringify({
        event: "SEED_PROD_COMPLETED",
        ...result,
      }),
    );
  } finally {
    await platformAdminDb.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown production seed error";
  console.error(
    JSON.stringify({
      event: "SEED_PROD_FAILED",
      message,
    }),
  );
  process.exit(1);
});
