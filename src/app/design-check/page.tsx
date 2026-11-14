import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { AppShell } from "@/components/shell/app-shell";
import { DesignCheckShowcase } from "@/components/shell/design-check-showcase";
import { getServerSessionUser } from "@/features/auth/session";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;

export const dynamic = "force-dynamic";

export default async function DesignCheckPage() {
  if (
    env.VERCEL_ENV === "production" ||
    env.NODE_ENV === "production"
  ) {
    notFound();
  }

  const user = await getServerSessionUser();

  return (
    <AppShell variant="manager" user={user}>
      <DesignCheckShowcase />
    </AppShell>
  );
}
