"use client";

import {
  Bell,
  ChevronRight,
  CircleHelp,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Shield,
  Users,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SessionUser } from "@/lib/authz-rules";
import { cn } from "@/lib/utils";

const MANAGER_NAV_ITEMS = [
  {
    key: "dashboard" as const,
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "menu" as const,
    href: "/menu",
    icon: Utensils,
  },
  {
    key: "imports" as const,
    href: "/imports",
    icon: FileSpreadsheet,
  },
  {
    key: "reports" as const,
    href: "/reports",
    icon: FileText,
  },
  {
    key: "notifications" as const,
    href: "/settings/notifications",
    icon: Bell,
  },
];

const PLATFORM_ADMIN_NAV_ITEMS = [
  {
    key: "admin" as const,
    href: "/admin",
    icon: Shield,
  },
];

interface ManagerNavProps {
  role?: SessionUser["role"] | null;
}

const MANAGER_SIDEBAR_EXTRA_ITEMS = [
  {
    key: "staff" as const,
    href: "/settings/staff",
    icon: Users,
  },
  {
    key: "help" as const,
    href: "/help",
    icon: CircleHelp,
  },
];

const PLATFORM_ADMIN_SIDEBAR_EXTRA_ITEMS = [
  {
    key: "help" as const,
    href: "/help",
    icon: CircleHelp,
  },
];

function getNavItems(role?: SessionUser["role"] | null) {
  return role === "PLATFORM_ADMIN"
    ? PLATFORM_ADMIN_NAV_ITEMS
    : MANAGER_NAV_ITEMS;
}

function getSidebarNavItems(role?: SessionUser["role"] | null) {
  return role === "PLATFORM_ADMIN"
    ? [...PLATFORM_ADMIN_NAV_ITEMS, ...PLATFORM_ADMIN_SIDEBAR_EXTRA_ITEMS]
    : [...MANAGER_NAV_ITEMS, ...MANAGER_SIDEBAR_EXTRA_ITEMS];
}

function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ManagerSidebar({ role }: ManagerNavProps) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const navItems = getSidebarNavItems(role);

  return (
    <aside
      aria-label={tNav("sidebarLabel")}
      className="hidden print:hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-e md:bg-card"
    >
      <nav className="flex flex-1 flex-col gap-1.5 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors text-start",
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-accent" : "text-secondary",
                  )}
                />
                <span>{tNav(item.key)}</span>
              </span>
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 rtl-flip transition-transform",
                  active
                    ? "text-accent opacity-100"
                    : "text-muted-foreground opacity-40 group-hover:opacity-80",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function ManagerMobileBottomNav({ role }: ManagerNavProps) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const navItems = getNavItems(role);

  return (
    <nav
      aria-label={tNav("mobileNavLabel")}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card shadow-lg print:hidden md:hidden"
    >
      <div
        className={cn(
          "grid w-full",
          navItems.length === 1 ? "grid-cols-1" : "grid-cols-5",
        )}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-[11px] leading-tight font-medium transition-colors",
                active
                  ? "border-t-2 border-accent bg-primary/5 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="max-w-full wrap-break-word">{tNav(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
