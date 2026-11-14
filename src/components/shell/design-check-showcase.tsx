"use client";

import {
  ArrowRight,
  CalendarDays,
  Scale,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/request";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

const BRAND_SWATCHES = [
  { key: "darkTeal" as const, hex: "#0B4F45", bgClass: "bg-brand-dark-teal" },
  { key: "midTeal" as const, hex: "#0E6B5C", bgClass: "bg-brand-mid-teal" },
  { key: "gold" as const, hex: "#C9A227", bgClass: "bg-brand-gold" },
  {
    key: "lightTint" as const,
    hex: "#F2F8F6",
    bgClass: "bg-brand-light-tint border",
  },
  { key: "text" as const, hex: "#1A1A1A", bgClass: "bg-brand-text" },
];

const SAMPLE_ENTRIES = [
  {
    code: "MANDI-01",
    itemKey: "mandi" as const,
    shiftKey: "EVENING" as const,
    reasonKey: "OVER_PREPARATION" as const,
    qty: "4.50",
    unitKey: "KG" as const,
    cost: "202.50",
    date: "2026-03-04T18:30:00.000Z",
    badgeVariant: "destructive" as const,
  },
  {
    code: "KABSA-02",
    itemKey: "kabsa" as const,
    shiftKey: "MORNING" as const,
    reasonKey: "EXPIRED" as const,
    qty: "3.00",
    unitKey: "PORTION" as const,
    cost: "84.00",
    date: "2026-03-04T11:15:00.000Z",
    badgeVariant: "accent" as const,
  },
  {
    code: "HUMMUS-03",
    itemKey: "hummus" as const,
    shiftKey: "EVENING" as const,
    reasonKey: "DAMAGED_IN_PREP" as const,
    qty: "1.25",
    unitKey: "KG" as const,
    cost: "35.00",
    date: "2026-03-03T19:45:00.000Z",
    badgeVariant: "secondary" as const,
  },
  {
    code: "KUNAFA-04",
    itemKey: "kunafa" as const,
    shiftKey: "NIGHT" as const,
    reasonKey: "CUSTOMER_RETURN" as const,
    qty: "2.00",
    unitKey: "PORTION" as const,
    cost: "64.00",
    date: "2026-03-03T23:20:00.000Z",
    badgeVariant: "outline" as const,
  },
];

export function DesignCheckShowcase() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("designCheck");
  const tWaste = useTranslations("waste");
  const tCommon = useTranslations("common");
  const [selectedReason, setSelectedReason] = useState("OVER_PREPARATION");

  const sampleDateParts = formatDate("2026-03-04T18:30:00.000Z", locale, {
    includeHijri: true,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 text-start">
      <div className="space-y-2">
        <Badge variant="accent" className="font-semibold">
          {t("badge")}
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {t("subtitle")}
        </p>
      </div>

      {/* Brand Color Palette */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {t("paletteTitle")}
          </CardTitle>
          <CardDescription>{t("paletteDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {BRAND_SWATCHES.map((swatch) => (
              <div
                key={swatch.key}
                className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5"
              >
                <span
                  className={`size-8 shrink-0 rounded-md shadow-xs ${swatch.bgClass}`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug">
                    {t(`colors.${swatch.key}`)}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground text-start">
                    <bdi dir="ltr">{swatch.hex}</bdi>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI & Intl Formatting Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardDescription className="font-medium">
                {t("kpiWasteCostLabel")}
              </CardDescription>
              <Wallet className="size-4 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-primary">
              {formatCurrency("1480.75", locale)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("kpiQuantityLabel")}:{" "}
              <span className="font-semibold text-foreground">
                {formatNumber("42.5", locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {tWaste("units.KG")}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardDescription className="font-medium">
                {t("kpiSavingsLabel")}
              </CardDescription>
              <Badge variant="accent">{tCommon("estimateBadge")}</Badge>
            </div>
            <CardTitle className="text-2xl font-bold text-secondary">
              {formatCurrency("3240.00", locale)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("formattingDescription")}
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardDescription className="font-medium">
                {t("kpiDateLabel")}
              </CardDescription>
              <CalendarDays className="size-4 text-secondary" />
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              {sampleDateParts.gregorian}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xs font-semibold text-secondary">
              {sampleDateParts.hijri}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {tCommon("hijriCalendarNote")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Buttons, Badges & Kitchen Touch Targets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("buttonsTitle")}</CardTitle>
            <CardDescription>{t("buttonsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="default">{t("btnPrimary")}</Button>
              <Button variant="secondary">{t("btnSecondary")}</Button>
              <Button variant="outline">{t("btnOutline")}</Button>
              <Button variant="ghost">{t("btnGhost")}</Button>
              <Button variant="destructive">{t("btnDestructive")}</Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button size="touch" className="min-h-12 gap-2">
                <Scale className="size-5" />
                <span>{t("btnKitchenTouch")}</span>
              </Button>
              <Button variant="outline" size="touch" className="min-h-12 gap-2">
                <span>{t("btnDirectional")}</span>
                <ArrowRight className="size-4 rtl-flip" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Badge variant="default">{t("badgeDefault")}</Badge>
              <Badge variant="secondary">{t("badgeSecondary")}</Badge>
              <Badge variant="accent">{t("badgeAccent")}</Badge>
              <Badge variant="outline">{t("badgeOutline")}</Badge>
              <Badge variant="destructive">{t("badgeDestructive")}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Inputs, Select & Dialog */}
        <Card>
          <CardHeader>
            <CardTitle>{t("inputsTitle")}</CardTitle>
            <CardDescription>{t("inputsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dc-item">{t("itemSearchLabel")}</Label>
                <Input
                  id="dc-item"
                  placeholder={t("itemSearchPlaceholder")}
                  className="min-h-12 h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dc-qty">{t("quantityInputLabel")}</Label>
                <Input
                  id="dc-qty"
                  type="number"
                  step="0.25"
                  defaultValue="2.50"
                  placeholder={t("quantityInputPlaceholder")}
                  className="min-h-12 h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dc-reason">{t("reasonSelectLabel")}</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger id="dc-reason" className="w-full min-h-12 h-12">
                  <SelectValue placeholder={t("reasonSelectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OVER_PREPARATION">
                    {tWaste("reasons.OVER_PREPARATION")}
                  </SelectItem>
                  <SelectItem value="EXPIRED">
                    {tWaste("reasons.EXPIRED")}
                  </SelectItem>
                  <SelectItem value="DAMAGED_IN_PREP">
                    {tWaste("reasons.DAMAGED_IN_PREP")}
                  </SelectItem>
                  <SelectItem value="CUSTOMER_RETURN">
                    {tWaste("reasons.CUSTOMER_RETURN")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="secondary"
                    size="touch"
                    data-testid="open-design-dialog"
                    className="w-full min-h-12 gap-2"
                  >
                    <Sparkles className="size-4 text-accent" />
                    <span>{t("openDialogButton")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("dialogTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("dialogDescription")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-2 text-start">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {t("colItem")}
                      </span>
                      <span className="font-semibold">
                        {t("sampleItems.mandi")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {t("colCost")}
                      </span>
                      <span className="font-semibold text-primary">
                        {formatCurrency("202.50", locale)}
                      </span>
                    </div>
                  </div>
                  <DialogFooter showCloseButton>
                    <Button type="button">{t("dialogConfirm")}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sample Waste Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tableTitle")}</CardTitle>
          <CardDescription>{t("tableDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colCode")}</TableHead>
                <TableHead>{t("colItem")}</TableHead>
                <TableHead>{t("colShift")}</TableHead>
                <TableHead>{t("colReason")}</TableHead>
                <TableHead className="text-end">{t("colQuantity")}</TableHead>
                <TableHead className="text-end">{t("colCost")}</TableHead>
                <TableHead>{t("colDate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SAMPLE_ENTRIES.map((row) => {
                const rowDate = formatDate(row.date, locale, {
                  includeHijri: true,
                });
                return (
                  <TableRow key={row.code}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.code}
                    </TableCell>
                    <TableCell className="font-medium">
                      {t(`sampleItems.${row.itemKey}`)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tWaste(`shifts.${row.shiftKey}`)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.badgeVariant}>
                        {tWaste(`reasons.${row.reasonKey}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {formatNumber(row.qty, locale, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {tWaste(`units.${row.unitKey}`)}
                    </TableCell>
                    <TableCell className="text-end font-semibold text-primary">
                      {formatCurrency(row.cost, locale)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {rowDate.gregorian}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {rowDate.hijri}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
