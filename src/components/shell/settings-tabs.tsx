import Link from "next/link";
import { Bell, Users } from "lucide-react";
import { getAppTranslations } from "@/i18n/request";
import { cn } from "@/lib/utils";

interface SettingsTabsProps {
  activeTab: "staff" | "notifications";
}

export async function SettingsTabs({ activeTab }: SettingsTabsProps) {
  const t = await getAppTranslations("settingsNav");

  const items = [
    {
      key: "staff" as const,
      href: "/settings/staff",
      label: t("staff"),
      icon: Users,
    },
    {
      key: "notifications" as const,
      href: "/settings/notifications",
      label: t("notifications"),
      icon: Bell,
    },
  ];

  return (
    <nav
      aria-label={t("title")}
      className="flex flex-wrap items-center gap-2 border-b pb-3 print:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeTab;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
