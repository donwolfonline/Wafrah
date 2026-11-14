"use client";

import type { ImportType } from "@prisma/client";
import { ArrowRightLeft, BookmarkCheck, HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ColumnMapping,
  TenantMenuItemOption,
  UnmatchedItemGroup,
} from "./schemas";

const COLUMN_UNMAPPED_VALUE = "__NONE__";
const UNMATCHED_SKIP_VALUE = "__SKIP__";

interface ImportMappingStepProps {
  type: ImportType;
  headers: string[];
  mapping: ColumnMapping;
  hasSavedMapping: boolean;
  unmatchedItems: UnmatchedItemGroup[];
  menuItems: TenantMenuItemOption[];
  disabled?: boolean;
  onChangeMapping: (next: ColumnMapping) => void;
  onChangeItemOverride: (rawName: string, target: string) => void;
}

export function ImportMappingStep({
  type,
  headers,
  mapping,
  hasSavedMapping,
  unmatchedItems,
  menuItems,
  disabled = false,
  onChangeMapping,
  onChangeItemOverride,
}: ImportMappingStepProps) {
  const t = useTranslations("sales");
  const locale = useLocale() === "en" ? "en" : "ar";

  const fields: Array<{
    key: keyof ColumnMapping;
    required: boolean;
  }> =
    type === "SALES"
      ? [
          { key: "date", required: true },
          { key: "item", required: true },
          { key: "quantity", required: true },
          { key: "channel", required: false },
        ]
      : [
          { key: "date", required: true },
          { key: "item", required: true },
          { key: "quantity", required: true },
          { key: "cost", required: false },
        ];

  const handleFieldChange = (field: keyof ColumnMapping, val: string) => {
    const nextValue = val === COLUMN_UNMAPPED_VALUE ? null : val;
    onChangeMapping({
      ...mapping,
      [field]: nextValue,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                <span>{t("mapping.title")}</span>
              </CardTitle>
              <CardDescription>{t("mapping.description")}</CardDescription>
            </div>
            {hasSavedMapping && (
              <Badge variant="secondary" className="gap-1.5">
                <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                <span>{t("mapping.savedBadge")}</span>
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map(({ key, required }) => {
              const currentValue = mapping[key] ?? COLUMN_UNMAPPED_VALUE;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label
                      htmlFor={`map-${key}`}
                      className="text-xs font-medium"
                    >
                      {t(`mapping.fields.${key}`)}
                    </Label>
                    <Badge
                      variant={required ? "default" : "outline"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {required
                        ? t("mapping.requiredTag")
                        : t("mapping.optionalTag")}
                    </Badge>
                  </div>
                  <Select
                    value={currentValue}
                    onValueChange={(v) => handleFieldChange(key, v)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id={`map-${key}`}
                      aria-label={t(`mapping.fields.${key}`)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COLUMN_UNMAPPED_VALUE}>
                        {t("mapping.unmappedOption")}
                      </SelectItem>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {unmatchedItems.length > 0 && (
        <Card className="border-amber-300/70 bg-amber-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4 text-amber-600" />
              <span>
                {t("unmatched.title", { count: unmatchedItems.length })}
              </span>
            </CardTitle>
            <CardDescription>{t("unmatched.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unmatchedItems.map((group) => (
              <div
                key={group.rawName}
                className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{group.rawName}</span>
                  <Badge variant="outline">
                    {t("unmatched.rowCountBadge", { count: group.rowCount })}
                  </Badge>
                </div>
                <div className="w-full sm:w-72">
                  <Select
                    value={group.selectedAction || undefined}
                    onValueChange={(v) =>
                      onChangeItemOverride(group.rawName, v)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger
                      aria-label={group.rawName}
                      data-testid={`unmatched-select-${group.rawName}`}
                    >
                      <SelectValue
                        placeholder={t("unmatched.selectItemPlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNMATCHED_SKIP_VALUE}>
                        {t("unmatched.skipOption")}
                      </SelectItem>
                      {menuItems.map((item) => {
                        const primary =
                          locale === "ar" ? item.nameAr : item.name;
                        const secondary =
                          locale === "ar" ? item.name : item.nameAr;
                        const label = item.code
                          ? `${primary} (${secondary}) · ${item.code}`
                          : `${primary} (${secondary})`;
                        return (
                          <SelectItem key={item.id} value={item.id}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
