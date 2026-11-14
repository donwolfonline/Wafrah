"use client";

import { Clock, Search, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WasteLogMenuItemDto } from "./schemas";

interface WasteStepItemsProps {
  items: WasteLogMenuItemDto[];
  recentItems: WasteLogMenuItemDto[];
  onSelectItem: (item: WasteLogMenuItemDto) => void;
}

export function WasteStepItems({
  items,
  recentItems,
  onSelectItem,
}: WasteStepItemsProps) {
  const t = useTranslations("waste");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const item of items) {
      if (item.category) unique.add(item.category);
    }
    return Array.from(unique);
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
        return false;
      }
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.nameAr.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.code?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [items, search, selectedCategory]);

  const getPrimaryName = (item: WasteLogMenuItemDto) =>
    locale === "ar" ? item.nameAr || item.name : item.name || item.nameAr;

  const getSecondaryName = (item: WasteLogMenuItemDto) =>
    locale === "ar" ? item.name : item.nameAr;

  return (
    <div className="flex flex-col gap-4" data-testid="waste-step-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="default"
            className="bg-primary text-primary-foreground"
          >
            {t("step1Badge")}
          </Badge>
          <h2 className="text-lg font-bold text-foreground">
            {t("step1Title")}
          </h2>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-12 ps-9 text-base"
            data-testid="waste-item-search"
          />
        </div>
      </div>

      {categories.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={cn(
              "min-h-10 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              selectedCategory === "ALL"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {t("allCategories")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "min-h-10 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                selectedCategory === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      {recentItems.length > 0 &&
      !search.trim() &&
      selectedCategory === "ALL" ? (
        <section
          aria-label={t("recentItemsTitle")}
          className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4"
          data-testid="waste-recent-items"
        >
          <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Clock className="size-3.5 text-accent" />
            <span>{t("recentItemsTitle")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {recentItems.slice(0, 6).map((item) => (
              <button
                key={`recent-${item.id}`}
                type="button"
                onClick={() => onSelectItem(item)}
                data-testid={`recent-item-${item.id}`}
                className="flex min-h-20 flex-col justify-between rounded-xl border border-primary/25 bg-card p-3 text-start shadow-xs transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
              >
                <span className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
                  {getPrimaryName(item)}
                </span>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] text-muted-foreground">
                    {item.category}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {t(`units.${item.unit}`)}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label={t("allItemsTitle")}>
        <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5 text-secondary" />
          <span>{t("allItemsTitle")}</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("emptyItems")}
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            data-testid="waste-item-grid"
          >
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                data-testid={`waste-item-${item.id}`}
                className="flex min-h-24 flex-col justify-between rounded-xl border bg-card p-3.5 text-start shadow-xs transition-all hover:border-primary hover:shadow-sm active:scale-[0.98]"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="line-clamp-2 text-base font-bold leading-snug text-foreground">
                    {getPrimaryName(item)}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {getSecondaryName(item)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {item.category}
                  </span>
                  <Badge variant="outline" className="shrink-0 font-semibold">
                    {t(`units.${item.unit}`)}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
