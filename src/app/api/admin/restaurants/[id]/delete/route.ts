import type { NextResponse } from "next/server";
import { handleAdminRestaurantDelete } from "@/features/admin";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return handleAdminRestaurantDelete(request, id);
}
