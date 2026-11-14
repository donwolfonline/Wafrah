import type { NextResponse } from "next/server";
import { handleAdminSubscriptionPatch } from "@/features/admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return handleAdminSubscriptionPatch(request, id);
}
