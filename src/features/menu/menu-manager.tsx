"use client";

import { FileSpreadsheet, Pencil, Plus, Power, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/request";
import { formatCurrency } from "@/lib/format";
import { toggleMenuItemActiveAction } from "./actions";
import { MenuCsvDialog } from "./menu-csv-dialog";
import { MenuItemDialog } from "./menu-item-dialog";
import type { SerializedMenuItem } from "./service";

interface MenuManagerProps {
  initialItems: SerializedMenuItem[];
}

export function MenuManager({ initialItems }: MenuManagerProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("menu");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [items, setItems] = useState<SerializedMenuItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SerializedMenuItem | null>(
    null,
  );
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const normalizedQuery = search.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (!showInactive && !item.active) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.nameAr.toLowerCase().includes(normalizedQuery) ||
      item.category.toLowerCase().includes(normalizedQuery) ||
      (item.code?.toLowerCase().includes(normalizedQuery) ?? false)
    );
  });

  function handleOpenCreate() {
    setEditingItem(null);
    setItemDialogOpen(true);
  }

  function handleOpenEdit(item: SerializedMenuItem) {
    setEditingItem(item);
    setItemDialogOpen(true);
  }

  function handleItemSaved(saved: SerializedMenuItem) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === saved.id);
      if (exists) {
        return prev.map((i) => (i.id === saved.id ? saved : i));
      }
      return [saved, ...prev];
    });
    router.refresh();
  }

  function handleToggleActive(item: SerializedMenuItem) {
    const nextActive = !item.active;
    startTransition(async () => {
      const result = await toggleMenuItemActiveAction({
        id: item.id,
        active: nextActive,
      });
      if (result.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? result.item : i)),
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t("description")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            data-testid="open-csv-import-dialog"
            onClick={() => setCsvDialogOpen(true)}
          >
            <FileSpreadsheet className="size-4 text-secondary" />
            <span>{t("importCsvButton")}</span>
          </Button>
          <Button
            type="button"
            data-testid="open-add-item-dialog"
            onClick={handleOpenCreate}
          >
            <Plus className="size-4" />
            <span>{t("addItemButton")}</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold">
                {t("summaryTitle")}
              </CardTitle>
              <CardDescription>{t("summaryBody")}</CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-2.5 start-3 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="ps-9"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                <span>{t("showInactiveLabel")}</span>
              </label>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.category")}</TableHead>
                <TableHead>{t("columns.unit")}</TableHead>
                <TableHead className="text-end">
                  {t("columns.unitCost")}
                </TableHead>
                <TableHead className="text-end">
                  {t("columns.shortageCost")}
                </TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="text-end">
                  {t("columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t("emptyState")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow
                    key={item.id}
                    data-testid={`menu-row-${item.id}`}
                    className={!item.active ? "opacity-60" : undefined}
                  >
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">
                          {item.nameAr || item.name}
                        </span>
                        {item.nameAr && item.name ? (
                          <span className="text-xs text-muted-foreground">
                            {item.name}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.unit}</Badge>
                    </TableCell>
                    <TableCell className="text-end font-semibold text-primary">
                      {formatCurrency(item.unitCost, locale)}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <span className="font-medium">
                          {formatCurrency(item.effectiveShortageCost, locale)}
                        </span>
                        {item.shortageCost === null ? (
                          <span className="text-[11px] text-muted-foreground">
                            ({t("defaultShortageTag")})
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.active ? "default" : "outline"}
                        data-testid={`status-badge-${item.id}`}
                      >
                        {item.active
                          ? t("status.active")
                          : t("status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          data-testid={`edit-item-${item.id}`}
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Pencil className="size-3" />
                          <span>{t("editButton")}</span>
                        </Button>
                        <Button
                          type="button"
                          variant={item.active ? "ghost" : "secondary"}
                          size="xs"
                          disabled={isPending}
                          data-testid={`toggle-active-${item.id}`}
                          onClick={() => handleToggleActive(item)}
                        >
                          <Power className="size-3" />
                          <span>
                            {item.active
                              ? t("status.deactivate")
                              : t("status.activate")}
                          </span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MenuItemDialog
        key={`${editingItem?.id ?? "new"}-${itemDialogOpen ? "open" : "closed"}`}
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        editingItem={editingItem}
        onSaved={handleItemSaved}
      />

      <MenuCsvDialog
        key={csvDialogOpen ? "csv-open" : "csv-closed"}
        open={csvDialogOpen}
        onOpenChange={setCsvDialogOpen}
        onImported={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
