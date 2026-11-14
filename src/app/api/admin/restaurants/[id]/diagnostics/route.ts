import type { NextResponse } from "next/server";
import { handleAdminDiagnosticsGet } from "@/features/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return handleAdminDiagnosticsGet(id);
}
