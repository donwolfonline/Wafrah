import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { getServerSessionUser } from "@/features/auth/session";
import { ImportManager } from "@/features/sales/import-manager";
import { getImportsBootstrapForTenant } from "@/features/sales/service";
import { requireRole } from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;

export default async function ImportsPage() {
  const sessionUser = await getServerSessionUser();
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const bootstrap = await getImportsBootstrapForTenant(user);

  return (
    <AppShell variant="manager" user={user}>
      <ImportManager initialBootstrap={bootstrap} />
    </AppShell>
  );
}
