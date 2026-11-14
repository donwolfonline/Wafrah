import { NextResponse } from "next/server";
import { setStaffMemberActive } from "@/features/staff";
import {
  checkStaffWriteRate,
  handleStaffHttpError,
} from "@/features/staff/http";
import { requireRole } from "@/lib/authz";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireRole(["MANAGER", "OWNER"]);
    const limited = checkStaffWriteRate(user, "staff-patch");
    if (limited) return limited;
    const { id } = await context.params;
    const body: unknown = await request.json();
    const staff = await setStaffMemberActive(user, id, body);
    return NextResponse.json({ ok: true, staff });
  } catch (error) {
    return handleStaffHttpError(error);
  }
}
