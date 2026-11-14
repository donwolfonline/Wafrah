import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LoginForm } from "@/features/auth/login-form";
import { getServerSessionUser } from "@/features/auth/session";
import { getRoleHomePath } from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;

interface LoginPageProps {
  searchParams: Promise<{ tab?: string; reason?: string; code?: string }>;
}

function sanitizeRestaurantCode(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  return normalized.length > 0 ? normalized : undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getServerSessionUser();
  if (user) {
    redirect(getRoleHomePath(user.role));
  }

  const resolvedParams = await searchParams;
  const defaultTab = resolvedParams?.tab === "staff" ? "staff" : "manager";
  const expiredSession = resolvedParams?.reason === "expired";
  const initialRestaurantCode = sanitizeRestaurantCode(resolvedParams?.code);

  return (
    <AppShell variant="auth" user={null}>
      <LoginForm
        defaultTab={defaultTab}
        expiredSession={expiredSession}
        initialRestaurantCode={initialRestaurantCode}
      />
    </AppShell>
  );
}
