import type { ReactNode } from "react";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { I18nProvider } from "@/i18n/provider";
import { getAppLocale, getAppMessages } from "@/i18n/request";
import type { SessionUser } from "@/lib/authz-rules";
import { AppHeader } from "./app-header";
import { FeedbackWidget } from "./feedback-widget";
import { ManagerMobileBottomNav, ManagerSidebar } from "./manager-nav";

interface AppShellProps {
  variant: "manager" | "kitchen" | "auth";
  user?: SessionUser | null;
  children: ReactNode;
}

export async function AppShell({
  variant,
  user = null,
  children,
}: AppShellProps) {
  const locale = await getAppLocale();
  const messages = await getAppMessages(locale);

  let content: ReactNode;
  if (variant === "kitchen") {
    content = (
      <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-background text-foreground">
        <AppHeader user={user} kitchenMode />
        <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
          {children}
        </main>
        {user ? <FeedbackWidget kitchenMode /> : null}
      </div>
    );
  } else if (variant === "auth") {
    content = (
      <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-background text-foreground">
        <AppHeader user={null} kitchenMode hideGuestActions />
        <main className="flex min-w-0 flex-1 items-center justify-center p-4 sm:p-6">
          {children}
        </main>
      </div>
    );
  } else {
    content = (
      <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-background text-foreground print:block print:min-h-0 print:overflow-visible print:bg-white">
        <AppHeader user={user} />
        <div className="flex min-w-0 flex-1 print:block">
          <ManagerSidebar role={user?.role} />
          <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:pb-6 print:p-0 print:pb-0">
            {children}
          </main>
        </div>
        <ManagerMobileBottomNav role={user?.role} />
        {user ? <FeedbackWidget /> : null}
      </div>
    );
  }

  return (
    <I18nProvider locale={locale} messages={messages}>
      <ServiceWorkerRegistrar />
      {content}
    </I18nProvider>
  );
}
