import { NextResponse } from "next/server";
import { resetStaffMemberPin } from "@/features/staff";
import {
  checkStaffWriteRate,
  handleStaffHttpError,
} from "@/features/staff/http";
import { requireRole } from "@/lib/authz";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireRole(["MANAGER", "OWNER"]);
    const limited = checkStaffWriteRate(user, "staff-reset-pin");
    if (limited) return limited;
    const { id } = await context.params;
    const result = await resetStaffMemberPin(user, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleStaffHttpError(error);
  }
}
