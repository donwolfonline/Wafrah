import { ArrowRight, Clock, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppTranslations } from "@/i18n/request";
import type { SessionUser } from "@/lib/authz";

export type ShellSection =
  "log" | "dashboard" | "menu" | "imports" | "reports" | "admin";

const SECTION_NAMESPACE_MAP = {
  log: "waste",
  dashboard: "insights",
  menu: "menu",
  imports: "sales",
  reports: "reports",
  admin: "admin",
} as const;

interface UserShellProps {
  section: ShellSection;
  user: SessionUser;
}

export async function UserShell({ section, user }: UserShellProps) {
  const tUserMenu = await getAppTranslations("userMenu");
  const tRoles = await getAppTranslations("roles");

  if (section === "log") {
    const tWaste = await getAppTranslations("waste");

    return (
      <AppShell variant="kitchen" user={user}>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6">
          <Card className="border-primary/20 shadow-md text-start">
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-2xl font-bold text-primary">
                  {tWaste("title")}
                </CardTitle>
                <Badge variant="secondary" className="px-3 py-1 text-sm">
                  <Clock className="me-1.5 size-3.5" />
                  {tWaste("shifts.EVENING")}
                </Badge>
              </div>
              <CardDescription className="text-base">
                {tWaste("description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-2">
                <h2 className="text-lg font-semibold text-foreground">
                  {tWaste("quickEntryTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {tWaste("quickEntrySubtitle")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(
                  [
                    "OVER_PREPARATION",
                    "EXPIRED",
                    "ORDER_ERROR",
                    "CUSTOMER_RETURN",
                    "DAMAGED_IN_PREP",
                    "OTHER",
                  ] as const
                ).map((reasonKey) => (
                  <Button
                    key={reasonKey}
                    type="button"
                    variant="outline"
                    size="touch"
                    className="min-h-12 justify-start text-start"
                  >
                    <span>{tWaste(`reasons.${reasonKey}`)}</span>
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  <span>{tUserMenu("signedInAs")}: </span>
                  <span className="font-semibold text-foreground">
                    {user.name}
                  </span>{" "}
                  <span>({tRoles(user.role)})</span>
                </div>
                <Button type="button" size="touch" className="min-h-12 gap-2">
                  <PlusCircle className="size-5" />
                  <span>{tWaste("startEntryButton")}</span>
                  <ArrowRight className="size-4 rtl-flip" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const namespace = SECTION_NAMESPACE_MAP[section];
  const tSection = await getAppTranslations(namespace);

  return (
    <AppShell variant="manager" user={user}>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 text-start">
            <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
              {tSection("title")}
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              {tSection("description")}
            </p>
          </div>
          <Badge variant="accent" className="px-3 py-1 text-xs font-semibold">
            {tRoles(user.role)}
          </Badge>
        </div>

        <Card className="text-start">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {tSection("summaryTitle")}
            </CardTitle>
            <CardDescription>{tSection("summaryBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {tUserMenu("signedInAs")}
                </span>
                <span className="font-semibold text-foreground">
                  {user.name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {tUserMenu("roleLabel")}
                </span>
                <span className="font-medium text-secondary">
                  {tRoles(user.role)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
