import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getServerSessionUser } from "@/features/auth/session";
import { MenuManager } from "@/features/menu/menu-manager";
import { listMenuItemsForTenant } from "@/features/menu/service";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;

export default async function MenuPage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  let user: SessionUser;
  try {
    user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(getRoleHomePath(sessionUser.role));
    }
    throw error;
  }

  const items = await listMenuItemsForTenant(user);

  return (
    <AppShell variant="manager" user={user}>
      <MenuManager initialItems={items} />
    </AppShell>
  );
}
