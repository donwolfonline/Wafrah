import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AdminConsole, getAdminOverview } from "@/features/admin";
import { getServerSessionUser } from "@/features/auth/session";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  let user: SessionUser;
  try {
    user = await requireRole("admin.*", sessionUser);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(getRoleHomePath(sessionUser.role));
    }
    throw error;
  }

  const overview = await getAdminOverview(user);

  return (
    <AppShell variant="manager" user={user}>
      <AdminConsole initialOverview={overview} />
    </AppShell>
  );
}
