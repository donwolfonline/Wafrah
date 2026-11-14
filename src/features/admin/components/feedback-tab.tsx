"use client";

import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatGregorianDate, type SupportedLocale } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminCustomerSummary, AdminFeedbackItem } from "../types";

interface FeedbackTabProps {
  items: AdminFeedbackItem[];
  customers: AdminCustomerSummary[];
}

export function FeedbackTab({ items, customers }: FeedbackTabProps) {
  const t = useTranslations("admin.feedback");
  const rawLocale = useLocale();
  const locale: SupportedLocale = rawLocale === "en" ? "en" : "ar";

  const [tenantFilter, setTenantFilter] = useState<string>("ALL");
  const [ratingFilter, setRatingFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const hasPlatformFeedback = useMemo(
    () => items.some((item) => item.tenantId === null),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      if (tenantFilter === "PLATFORM") {
        if (item.tenantId !== null) return false;
      } else if (tenantFilter !== "ALL") {
        if (item.tenantId !== tenantFilter) return false;
      }

      if (ratingFilter === "LOW") {
        if (item.rating > 3) return false;
      } else if (ratingFilter !== "ALL") {
        if (String(item.rating) !== ratingFilter) return false;
      }

      if (query.length > 0) {
        const haystack = [
          item.message,
          item.page,
          item.userName,
          item.username ?? "",
          item.restaurantName ?? "",
          item.restaurantNameAr ?? "",
          item.restaurantCode ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [items, tenantFilter, ratingFilter, searchQuery]);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">
            {t("totalShown", {
              count: filteredItems.length,
              total: items.length,
            })}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger aria-label={t("filterRestaurant")} className="w-full">
              <SelectValue placeholder={t("filterRestaurant")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allRestaurants")}</SelectItem>
              {hasPlatformFeedback ? (
                <SelectItem value="PLATFORM">{t("platformWide")}</SelectItem>
              ) : null}
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {locale === "ar" ? customer.nameAr : customer.name} (
                  {customer.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger aria-label={t("filterRating")} className="w-full">
              <SelectValue placeholder={t("filterRating")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allRatings")}</SelectItem>
              <SelectItem value="LOW">{t("lowRatings")}</SelectItem>
              <SelectItem value="5">{t("exactStars", { stars: 5 })}</SelectItem>
              <SelectItem value="4">{t("exactStars", { stars: 4 })}</SelectItem>
              <SelectItem value="3">{t("exactStars", { stars: 3 })}</SelectItem>
              <SelectItem value="2">{t("exactStars", { stars: 2 })}</SelectItem>
              <SelectItem value="1">{t("exactOneStar")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="ps-9"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {filteredItems.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const restaurantLabel = item.tenantId
                ? `${locale === "ar" ? item.restaurantNameAr : item.restaurantName} (${item.restaurantCode})`
                : t("platformWide");

              return (
                <article
                  key={item.id}
                  data-testid={`feedback-item-${item.id}`}
                  className="space-y-2 rounded-lg border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="flex items-center gap-0.5"
                        aria-label={`${item.rating} / 5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "size-4",
                              star <= item.rating
                                ? "fill-amber-400 text-amber-500"
                                : "text-muted-foreground/30",
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">
                        {restaurantLabel}
                      </span>
                      <Badge variant="outline" className="font-mono text-xs">
                        <span dir="ltr">{item.page}</span>
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatGregorianDate(item.createdAt, locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {item.message}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {item.userName}
                    {item.username ? (
                      <span dir="ltr" className="ms-1 font-mono">
                        ({item.username})
                      </span>
                    ) : null}
                    {" · "}
                    {item.userRole}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
