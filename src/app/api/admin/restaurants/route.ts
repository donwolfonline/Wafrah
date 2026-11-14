import type { NextResponse } from "next/server";
import { handleAdminRestaurantsPost } from "@/features/admin";

export async function POST(request: Request): Promise<NextResponse> {
  return handleAdminRestaurantsPost(request);
}
