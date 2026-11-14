import type { NextResponse } from "next/server";
import { handleAdminLeadPatch } from "@/features/admin/leads-http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return handleAdminLeadPatch(request, id);
}
