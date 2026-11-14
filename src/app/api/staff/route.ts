import { NextResponse } from "next/server";
import { createStaffMember, listStaffForTenant } from "@/features/staff";
import {
  checkStaffWriteRate,
  handleStaffHttpError,
} from "@/features/staff/http";
import { requireRole } from "@/lib/authz";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireRole(["MANAGER", "OWNER"]);
    const data = await listStaffForTenant(user);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return handleStaffHttpError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireRole(["MANAGER", "OWNER"]);
    const limited = checkStaffWriteRate(user, "staff-post");
    if (limited) return limited;
    const body: unknown = await request.json();
    const created = await createStaffMember(user, body);
    return NextResponse.json({ ok: true, ...created }, { status: 201 });
  } catch (error) {
    return handleStaffHttpError(error);
  }
}
