"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loginManagerAction, loginStaffAction } from "./actions";

const RESTAURANT_CODE_STORAGE_KEY = "wafrah.restaurantCode";

function readRememberedRestaurantCode(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(RESTAURANT_CODE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

interface LoginFormProps {
  defaultTab?: "manager" | "staff";
  expiredSession?: boolean;
  initialRestaurantCode?: string;
}

export function LoginForm({
  defaultTab = "manager",
  expiredSession = false,
  initialRestaurantCode,
}: LoginFormProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [restaurantCode, setRestaurantCode] = useState<string>(() => {
    if (initialRestaurantCode) {
      return initialRestaurantCode;
    }
    return readRememberedRestaurantCode();
  });
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [hasRememberedCode, setHasRememberedCode] = useState<boolean>(() => {
    if (initialRestaurantCode) {
      return false;
    }
    return readRememberedRestaurantCode().length > 0;
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleManagerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      const result = await loginManagerAction({ email, password });
      if (!result.ok) {
        setErrorMessage(t(`errors.${result.errorKey}`));
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  function handleStaffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const normalizedCode = restaurantCode.trim().toUpperCase();
    startTransition(async () => {
      const result = await loginStaffAction({
        restaurantCode: normalizedCode,
        username,
        pin,
      });
      if (!result.ok) {
        setErrorMessage(t(`errors.${result.errorKey}`));
        return;
      }
      try {
        window.localStorage.setItem(
          RESTAURANT_CODE_STORAGE_KEY,
          normalizedCode,
        );
        setHasRememberedCode(true);
      } catch {
        // Ignore storage write errors
      }
      router.push("/log");
      router.refresh();
    });
  }

  function handleSwitchStaffUser() {
    setUsername("");
    setPin("");
    setErrorMessage(null);
  }

  return (
    <Card className="my-auto w-full max-w-md border-primary/15 shadow-md">
      <CardHeader className="px-4 text-start sm:px-6">
        <CardTitle className="text-xl font-bold text-primary sm:text-2xl">
          {t("loginTitle")}
        </CardTitle>
        <CardDescription>{t("loginSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            setErrorMessage(null);
          }}
          className="w-full"
        >
          <TabsList className="mb-5 grid h-auto min-h-12 w-full grid-cols-2 items-stretch p-1 group-data-[orientation=horizontal]/tabs:h-auto">
            <TabsTrigger value="manager" className="min-h-10 font-semibold">
              {t("tabs.manager")}
            </TabsTrigger>
            <TabsTrigger value="staff" className="min-h-10 font-semibold">
              {t("tabs.staff")}
            </TabsTrigger>
          </TabsList>

          {errorMessage ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive text-start"
            >
              {errorMessage}
            </div>
          ) : expiredSession ? (
            <div
              role="status"
              data-testid="login-expired-notice"
              className="mb-4 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 text-start"
            >
              {t("errors.sessionExpiredNotice")}
            </div>
          ) : null}

          <TabsContent value="manager">
            <form onSubmit={handleManagerSubmit} className="space-y-4">
              <div className="space-y-2 text-start">
                <Label htmlFor="manager-email">{t("manager.emailLabel")}</Label>
                <Input
                  id="manager-email"
                  name="email"
                  type="text"
                  inputMode="email"
                  dir="ltr"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("manager.emailPlaceholder")}
                  className="h-11 text-start"
                />
              </div>

              <div className="space-y-2 text-start">
                <Label htmlFor="manager-password">
                  {t("manager.passwordLabel")}
                </Label>
                <Input
                  id="manager-password"
                  name="password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("manager.passwordPlaceholder")}
                  className="h-11 text-start"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full gap-2"
                disabled={isPending}
              >
                <span>
                  {isPending ? t("manager.submitting") : t("manager.submit")}
                </span>
                <ArrowRight className="size-4 rtl-flip" />
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="staff">
            <form onSubmit={handleStaffSubmit} className="space-y-4">
              <div className="space-y-2 text-start">
                <Label htmlFor="staff-restaurant-code">
                  {t("staff.restaurantCodeLabel")}
                </Label>
                <Input
                  id="staff-restaurant-code"
                  name="restaurantCode"
                  type="text"
                  dir="ltr"
                  required
                  value={restaurantCode}
                  onChange={(e) =>
                    setRestaurantCode(e.target.value.toUpperCase())
                  }
                  placeholder={t("staff.restaurantCodePlaceholder")}
                  className="min-h-12 h-12 text-base font-medium text-start"
                />
                {hasRememberedCode ? (
                  <p className="text-xs text-muted-foreground">
                    {t("staff.rememberedCodeHint")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 text-start">
                <Label htmlFor="staff-username">
                  {t("staff.usernameLabel")}
                </Label>
                <Input
                  id="staff-username"
                  name="username"
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("staff.usernamePlaceholder")}
                  className="min-h-12 h-12 text-base text-start"
                />
              </div>

              <div className="space-y-2 text-start">
                <Label htmlFor="staff-pin">{t("staff.pinLabel")}</Label>
                <Input
                  id="staff-pin"
                  name="pin"
                  type="password"
                  dir="ltr"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder={t("staff.pinPlaceholder")}
                  className="min-h-12 h-12 text-lg tracking-widest text-start"
                />
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  type="submit"
                  size="touch"
                  className="flex-1 min-h-12 gap-2"
                  disabled={isPending}
                >
                  <span>
                    {isPending ? t("staff.submitting") : t("staff.submit")}
                  </span>
                  <ArrowRight className="size-4 rtl-flip" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="min-h-12"
                  onClick={handleSwitchStaffUser}
                  disabled={isPending}
                >
                  {t("staff.switchUser")}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            {t("legal.privacy")}
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            {t("legal.terms")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
