import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getServerSessionUser } from "@/features/auth/session";
import { getWasteLogBootstrapForUser } from "@/features/waste/service";
import { WasteLogger } from "@/features/waste/waste-logger";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;

export default async function LogPage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  let user: SessionUser;
  try {
    user = await requireRole(["STAFF", "MANAGER", "OWNER"], sessionUser);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(getRoleHomePath(sessionUser.role));
    }
    throw error;
  }

  const initialData = await getWasteLogBootstrapForUser(user);

  return (
    <AppShell variant="kitchen" user={user}>
      <WasteLogger initialData={initialData} userRole={user.role} />
    </AppShell>
  );
}
