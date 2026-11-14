import type { NextResponse } from "next/server";
import { handleAdminLeadsGet } from "@/features/admin/leads-http";

export async function GET(request: Request): Promise<NextResponse> {
  return handleAdminLeadsGet(request);
}
