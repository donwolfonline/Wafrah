import { Prisma, type MenuItem, type Unit } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { requireRole, type SessionUser } from "@/lib/authz";
import { getTenantDb } from "@/lib/tenant";
import {
  computeDefaultShortageCost,
  importMenuItemsBatchSchema,
  menuItemInputSchema,
  toggleMenuItemActiveSchema,
  updateMenuItemSchema,
} from "./schemas";

export interface SerializedMenuItem {
  id: string;
  tenantId: string;
  code: string | null;
  name: string;
  nameAr: string;
  category: string;
  unit: Unit;
  unitCost: string;
  shortageCost: string | null;
  effectiveShortageCost: string;
  active: boolean;
}

export function serializeMenuItem(item: MenuItem): SerializedMenuItem {
  const unitCost = new Prisma.Decimal(item.unitCost.toString()).toFixed(2);
  const shortageCost =
    item.shortageCost !== null && item.shortageCost !== undefined
      ? new Prisma.Decimal(item.shortageCost.toString()).toFixed(2)
      : null;

  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    name: item.name,
    nameAr: item.nameAr,
    category: item.category,
    unit: item.unit,
    unitCost,
    shortageCost,
    effectiveShortageCost: shortageCost ?? computeDefaultShortageCost(unitCost),
    active: item.active,
  };
}

export async function listMenuItemsForTenant(
  sessionUserOverride?: SessionUser | null,
): Promise<SerializedMenuItem[]> {
  const user = await requireRole("menu.manage", sessionUserOverride);
  const db = await getTenantDb(user);

  const items = await db.menuItem.findMany({
    orderBy: [{ active: "desc" }, { category: "asc" }, { createdAt: "desc" }],
  });

  return items.map(serializeMenuItem);
}

export async function createMenuItemForTenant(
  rawInput: unknown,
  sessionUserOverride?: SessionUser | null,
): Promise<SerializedMenuItem> {
  const user = await requireRole("menu.manage", sessionUserOverride);
  const parsed = menuItemInputSchema.parse(rawInput);
  const db = await getTenantDb(user);

  const created = await db.menuItem.create({
    data: {
      tenantId: user.tenantId!,
      code: parsed.code,
      name: parsed.name,
      nameAr: parsed.nameAr,
      category: parsed.category,
      unit: parsed.unit,
      unitCost: new Prisma.Decimal(parsed.unitCost),
      shortageCost: parsed.shortageCost
        ? new Prisma.Decimal(parsed.shortageCost)
        : null,
      active: true,
    },
  });

  await recordAuditLog({
    tenantId: user.tenantId,
    userId: user.userId,
    action: "MENU_ITEM_CREATED",
    entity: "MenuItem",
    entityId: created.id,
    metadata: {
      name: created.name,
      nameAr: created.nameAr,
      category: created.category,
      unit: created.unit,
      unitCost: parsed.unitCost,
      shortageCost: parsed.shortageCost,
    },
  });

  return serializeMenuItem(created);
}

export async function updateMenuItemForTenant(
  rawInput: unknown,
  sessionUserOverride?: SessionUser | null,
): Promise<SerializedMenuItem> {
  const user = await requireRole("menu.manage", sessionUserOverride);
  const parsed = updateMenuItemSchema.parse(rawInput);
  const db = await getTenantDb(user);

  const updated = await db.menuItem.update({
    where: { id: parsed.id },
    data: {
      code: parsed.input.code,
      name: parsed.input.name,
      nameAr: parsed.input.nameAr,
      category: parsed.input.category,
      unit: parsed.input.unit,
      unitCost: new Prisma.Decimal(parsed.input.unitCost),
      shortageCost: parsed.input.shortageCost
        ? new Prisma.Decimal(parsed.input.shortageCost)
        : null,
    },
  });

  await recordAuditLog({
    tenantId: user.tenantId,
    userId: user.userId,
    action: "MENU_ITEM_UPDATED",
    entity: "MenuItem",
    entityId: updated.id,
    metadata: {
      name: updated.name,
      nameAr: updated.nameAr,
      category: updated.category,
      unit: updated.unit,
      unitCost: parsed.input.unitCost,
      shortageCost: parsed.input.shortageCost,
    },
  });

  return serializeMenuItem(updated);
}

export async function setMenuItemActiveForTenant(
  rawInput: unknown,
  sessionUserOverride?: SessionUser | null,
): Promise<SerializedMenuItem> {
  const user = await requireRole("menu.manage", sessionUserOverride);
  const parsed = toggleMenuItemActiveSchema.parse(rawInput);
  const db = await getTenantDb(user);

  const updated = await db.menuItem.update({
    where: { id: parsed.id },
    data: { active: parsed.active },
  });

  await recordAuditLog({
    tenantId: user.tenantId,
    userId: user.userId,
    action: parsed.active ? "MENU_ITEM_ACTIVATED" : "MENU_ITEM_DEACTIVATED",
    entity: "MenuItem",
    entityId: updated.id,
    metadata: {
      active: updated.active,
      name: updated.name,
      nameAr: updated.nameAr,
    },
  });

  return serializeMenuItem(updated);
}

export async function importMenuItemsForTenant(
  rawInput: unknown,
  sessionUserOverride?: SessionUser | null,
): Promise<{ importedCount: number; items: SerializedMenuItem[] }> {
  const user = await requireRole("menu.manage", sessionUserOverride);
  const parsed = importMenuItemsBatchSchema.parse(rawInput);
  const db = await getTenantDb(user);

  const existingItems = await db.menuItem.findMany();
  const imported: SerializedMenuItem[] = [];

  for (const row of parsed.rows) {
    const match = existingItems.find((item) => {
      if (row.code && item.code && item.code.toUpperCase() === row.code) {
        return true;
      }
      if (
        row.name &&
        item.name &&
        item.name.trim().toLowerCase() === row.name.toLowerCase()
      ) {
        return true;
      }
      if (row.nameAr && item.nameAr && item.nameAr.trim() === row.nameAr) {
        return true;
      }
      return false;
    });

    if (match) {
      const updated = await db.menuItem.update({
        where: { id: match.id },
        data: {
          code: row.code ?? match.code,
          name: row.name || match.name,
          nameAr: row.nameAr || match.nameAr,
          category: row.category,
          unit: row.unit,
          unitCost: new Prisma.Decimal(row.unitCost),
          shortageCost: row.shortageCost
            ? new Prisma.Decimal(row.shortageCost)
            : null,
          active: true,
        },
      });
      imported.push(serializeMenuItem(updated));
    } else {
      const created = await db.menuItem.create({
        data: {
          tenantId: user.tenantId!,
          code: row.code,
          name: row.name,
          nameAr: row.nameAr,
          category: row.category,
          unit: row.unit,
          unitCost: new Prisma.Decimal(row.unitCost),
          shortageCost: row.shortageCost
            ? new Prisma.Decimal(row.shortageCost)
            : null,
          active: true,
        },
      });
      existingItems.push(created);
      imported.push(serializeMenuItem(created));
    }
  }

  await recordAuditLog({
    tenantId: user.tenantId,
    userId: user.userId,
    action: "MENU_ITEMS_IMPORTED",
    entity: "MenuItem",
    entityId: user.tenantId ?? "batch",
    metadata: {
      importedCount: imported.length,
    },
  });

  return {
    importedCount: imported.length,
    items: imported,
  };
}
