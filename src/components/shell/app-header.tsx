import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { getAppTranslations } from "@/i18n/request";
import type { SessionUser } from "@/lib/authz-rules";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import { HeaderHelpLink } from "./header-help-link";
import { UserMenu } from "./user-menu";

interface AppHeaderProps {
  user?: SessionUser | null;
  kitchenMode?: boolean;
  hideGuestActions?: boolean;
}

export async function AppHeader({
  user = null,
  kitchenMode = false,
  hideGuestActions = false,
}: AppHeaderProps) {
  const tApp = await getAppTranslations("app");

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex w-full flex-wrap items-center justify-between gap-2 border-b bg-card px-3 shadow-xs print:hidden sm:gap-3 sm:px-4 md:px-6",
        kitchenMode ? "min-h-16 py-2.5" : "min-h-14 py-2",
      )}
    >
      <Link
        href="/"
        className="flex min-w-0 items-center rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandLogo
          wordmark={tApp("logoText")}
          subtitle={tApp("tagline")}
          variant="onLight"
        />
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">
        {!hideGuestActions ? <HeaderHelpLink touchTarget={kitchenMode} /> : null}
        <LanguageSwitcher touchTarget={kitchenMode} />
        <UserMenu
          user={user}
          touchTarget={kitchenMode}
          hideGuestActions={hideGuestActions}
        />
      </div>
    </header>
  );
}
