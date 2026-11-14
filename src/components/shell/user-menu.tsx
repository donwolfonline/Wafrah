"use client";

import { LogOut, RefreshCw, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import type { SessionUser } from "@/lib/authz-rules";

interface UserMenuProps {
  user: SessionUser | null;
  touchTarget?: boolean;
  hideGuestActions?: boolean;
}

export function UserMenu({
  user,
  touchTarget = false,
  hideGuestActions = false,
}: UserMenuProps) {
  const tUser = useTranslations("userMenu");
  const tRoles = useTranslations("roles");

  if (!user) {
    if (hideGuestActions) {
      return null;
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="hidden sm:inline-flex">
          {tUser("guest")}
        </Badge>
        <Button asChild variant="secondary" size={touchTarget ? "touch" : "sm"}>
          <Link href="/login">{tUser("signIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden items-center gap-2 rounded-md border bg-muted/60 px-3 py-1.5 text-xs sm:flex">
        <UserRound className="size-3.5 text-primary" />
        <span className="font-semibold text-foreground">
          {user.name ?? user.userId}
        </span>
        <Badge variant="secondary" className="text-[11px]">
          {tRoles(user.role)}
        </Badge>
      </div>

      {user.role === "STAFF" ? (
        <form action={logoutAction}>
          <input type="hidden" name="mode" value="switch-staff" />
          <Button
            type="submit"
            variant="outline"
            size={touchTarget ? "touch" : "sm"}
            className={touchTarget ? "min-h-12 px-3 text-xs sm:px-5 sm:text-sm" : undefined}
          >
            <RefreshCw className="size-4" />
            <span>{tUser("switchUser")}</span>
          </Button>
        </form>
      ) : null}

      <form action={logoutAction}>
        <Button
          type="submit"
          variant="default"
          size={touchTarget ? "touch" : "sm"}
          className={touchTarget ? "min-h-12 px-3 text-xs sm:px-5 sm:text-sm" : undefined}
        >
          <LogOut className="size-4 rtl-flip" />
          <span>{tUser("logout")}</span>
        </Button>
      </form>
    </div>
  );
}
