import type { NextResponse } from "next/server";
import { handleAdminSuspendPost } from "@/features/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  return handleAdminSuspendPost(request, id);
}
