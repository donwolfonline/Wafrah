import type { NextResponse } from "next/server";
import { handleAdminLeadsExportGet } from "@/features/admin/leads-http";

export async function GET(request: Request): Promise<NextResponse> {
  return handleAdminLeadsExportGet(request);
}
