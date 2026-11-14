import { Prisma, type Shift, type Unit } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { requireRole, type SessionUser } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { getTenantDb, TenantIsolationError } from "@/lib/tenant";
import {
  calculateTodayWasteSarForTenant,
  getWasteLogBootstrapForUser,
} from "./bootstrap";
import {
  UNDO_WINDOW_MS,
  validateQuantityForUnit,
  type WasteEntryDto,
  wasteEntryCreateSchema,
  wasteEntryUndoSchema,
} from "./schemas";
import { detectShift } from "./shift";

export { calculateTodayWasteSarForTenant, getWasteLogBootstrapForUser };

export class WasteValidationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "WasteValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function serializeWasteEntry(entry: {
  id: string;
  clientId: string;
  menuItemId: string;
  quantity: Prisma.Decimal;
  reason: WasteEntryDto["reason"];
  shift: Shift;
  occurredAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
  loggedById: string;
  note: string | null;
  menuItem: { unitCost: Prisma.Decimal };
}): WasteEntryDto {
  const wasteCost = entry.quantity.mul(entry.menuItem.unitCost);
  return {
    id: entry.id,
    clientId: entry.clientId,
    menuItemId: entry.menuItemId,
    quantity: entry.quantity.toString(),
    wasteCostSar: wasteCost.toFixed(2),
    reason: entry.reason,
    shift: entry.shift,
    occurredAt: entry.occurredAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
    loggedById: entry.loggedById,
    note: entry.note,
  };
}

export interface CreateWasteEntryOptions {
  maxByUnit?: Partial<Record<Unit, number>>;
  now?: Date;
}

export async function createWasteEntryForUser(
  sessionUser: SessionUser | null | undefined,
  rawInput: unknown,
  options?: CreateWasteEntryOptions,
): Promise<{
  entry: WasteEntryDto;
  created: boolean;
  todayWasteSar: string;
}> {
  const user = await requireRole("waste.create", sessionUser);
  const db = await getTenantDb(user);
  const now = options?.now ?? new Date();

  const parsed = wasteEntryCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "invalidInput";
    throw new WasteValidationError(firstIssue, firstIssue, 400);
  }

  const { clientId, menuItemId, quantity, reason, shift, occurredAt, note } =
    parsed.data;

  // Idempotency check on (tenantId, clientId)
  const existing = await db.wasteEntry.findFirst({
    where: { clientId },
    include: {
      menuItem: {
        select: { unitCost: true },
      },
    },
  });

  if (existing) {
    const todayWasteSar = await calculateTodayWasteSarForTenant(db, now);
    return {
      entry: serializeWasteEntry(existing),
      created: false,
      todayWasteSar,
    };
  }

  // Verify the menu item belongs to the session tenant
  const menuItem = await db.menuItem.findFirst({
    where: { id: menuItemId },
    select: {
      id: true,
      unit: true,
      unitCost: true,
      active: true,
    },
  });

  if (!menuItem) {
    throw new TenantIsolationError(
      `MenuItem ${menuItemId} does not belong to tenant`,
    );
  }

  const quantityCheck = validateQuantityForUnit(
    quantity,
    menuItem.unit,
    options?.maxByUnit,
  );
  if (!quantityCheck.ok) {
    throw new WasteValidationError(
      quantityCheck.code,
      quantityCheck.maxAllowed
        ? `Quantity exceeds maximum allowed (${quantityCheck.maxAllowed} ${menuItem.unit})`
        : "Quantity must be greater than 0",
      400,
    );
  }

  const restaurant = await db.restaurant.findFirstOrThrow({
    select: {
      shiftConfig: true,
      timezone: true,
    },
  });

  const resolvedOccurredAt = occurredAt ? new Date(occurredAt) : now;
  const resolvedShift =
    shift ??
    detectShift(
      resolvedOccurredAt,
      restaurant.shiftConfig,
      restaurant.timezone || RIYADH_TIME_ZONE,
    );

  try {
    const created = await db.wasteEntry.create({
      data: {
        tenantId: user.tenantId!,
        clientId,
        menuItemId: menuItem.id,
        quantity: quantityCheck.decimal,
        reason,
        shift: resolvedShift,
        occurredAt: resolvedOccurredAt,
        createdAt: now,
        loggedById: user.userId,
        note: note ?? null,
      },
      include: {
        menuItem: {
          select: { unitCost: true },
        },
      },
    });

    await recordAuditLog({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "WASTE_ENTRY_CREATE",
      entity: "WasteEntry",
      entityId: created.id,
      metadata: {
        clientId,
        menuItemId: menuItem.id,
        quantity: created.quantity.toString(),
        reason: created.reason,
        shift: created.shift,
      },
    });

    const todayWasteSar = await calculateTodayWasteSarForTenant(
      db,
      now,
      restaurant.timezone || RIYADH_TIME_ZONE,
    );

    return {
      entry: serializeWasteEntry(created),
      created: true,
      todayWasteSar,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrentExisting = await db.wasteEntry.findFirstOrThrow({
        where: { clientId },
        include: {
          menuItem: {
            select: { unitCost: true },
          },
        },
      });
      const todayWasteSar = await calculateTodayWasteSarForTenant(db, now);
      return {
        entry: serializeWasteEntry(concurrentExisting),
        created: false,
        todayWasteSar,
      };
    }
    throw error;
  }
}

export async function undoWasteEntryForUser(
  sessionUser: SessionUser | null | undefined,
  rawInput: unknown,
  options?: { now?: Date; undoWindowMs?: number },
): Promise<{
  status: "deleted" | "already_deleted" | "not_found";
  entry?: WasteEntryDto;
  todayWasteSar: string;
}> {
  const user = await requireRole("waste.create", sessionUser);
  const db = await getTenantDb(user);
  const now = options?.now ?? new Date();
  const undoWindowMs = options?.undoWindowMs ?? UNDO_WINDOW_MS;

  const parsed = wasteEntryUndoSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new WasteValidationError("invalidClientId", "Invalid clientId", 400);
  }

  const { clientId } = parsed.data;
  const existing = await db.wasteEntry.findFirst({
    where: { clientId },
    include: {
      menuItem: {
        select: { unitCost: true },
      },
    },
  });

  if (!existing) {
    const todayWasteSar = await calculateTodayWasteSarForTenant(db, now);
    return { status: "not_found", todayWasteSar };
  }

  if (existing.deletedAt !== null) {
    const todayWasteSar = await calculateTodayWasteSarForTenant(db, now);
    return {
      status: "already_deleted",
      entry: serializeWasteEntry(existing),
      todayWasteSar,
    };
  }

  const elapsedMs = now.getTime() - existing.createdAt.getTime();
  if (elapsedMs > undoWindowMs) {
    throw new WasteValidationError(
      "UNDO_WINDOW_EXPIRED",
      "Undo window of 10 seconds has expired",
      409,
    );
  }

  const updated = await db.wasteEntry.update({
    where: { id: existing.id },
    data: { deletedAt: now },
    include: {
      menuItem: {
        select: { unitCost: true },
      },
    },
  });

  await recordAuditLog({
    tenantId: user.tenantId,
    userId: user.userId,
    action: "WASTE_ENTRY_UNDO",
    entity: "WasteEntry",
    entityId: updated.id,
    metadata: { clientId },
  });

  const todayWasteSar = await calculateTodayWasteSarForTenant(db, now);

  return {
    status: "deleted",
    entry: serializeWasteEntry(updated),
    todayWasteSar,
  };
}
