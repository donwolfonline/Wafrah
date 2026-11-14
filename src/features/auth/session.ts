import type { SessionUser } from "@/lib/authz";
import { auth } from "./auth";

export async function getServerSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  // Fail closed if Auth.js attached an error marker (mitigates GHSA-8fpg-xm3f-6cx3).
  if ((session as { error?: unknown } | null)?.error) {
    return null;
  }
  if (!session?.user?.userId || !session.user.role) {
    return null;
  }

  return {
    userId: session.user.userId,
    name: session.user.name ?? "User",
    role: session.user.role,
    tenantId: session.user.tenantId ?? null,
    locale: session.user.locale ?? "ar",
  };
}
