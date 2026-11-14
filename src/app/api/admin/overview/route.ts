import type { NextResponse } from "next/server";
import { handleAdminOverviewGet } from "@/features/admin";

export async function GET(): Promise<NextResponse> {
  return handleAdminOverviewGet();
}
