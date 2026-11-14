import { handleDashboardGet } from "@/features/auth/protected-routes";

export async function GET() {
  return handleDashboardGet();
}
