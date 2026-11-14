import { handleAdminGet } from "@/features/auth/protected-routes";

export async function GET() {
  return handleAdminGet();
}
