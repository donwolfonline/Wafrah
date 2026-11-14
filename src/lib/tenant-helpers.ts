import type { PrismaClient } from "@prisma/client";

export class TenantIsolationError extends Error {
  public readonly statusCode = 403;

  constructor(message = "Cross-tenant access denied") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export const STRICT_TENANT_MODELS = new Set([
  "User",
  "MenuItem",
  "WasteEntry",
  "SalesRecord",
  "PurchaseRecord",
  "ForecastResult",
  "Alert",
  "Subscription",
  "AuditLog",
  "ImportColumnMapping",
  "ImportBatch",
  "NotificationPreference",
  "Feedback",
]);

export const PLATFORM_ONLY_MODELS = new Set(["Lead"]);

export const MODELS_WITH_MENU_ITEM_FK = new Set([
  "WasteEntry",
  "SalesRecord",
  "PurchaseRecord",
  "ForecastResult",
  "Alert",
]);

export function toDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export function stripTenantFields(
  data: Record<string, unknown>,
  tenantId: string,
) {
  const clone: Record<string, unknown> = { ...data };
  delete clone.tenant;
  clone.tenantId = tenantId;
  return clone;
}

export async function verifyMenuItemOwnership(
  baseClient: PrismaClient,
  tenantId: string,
  data: Record<string, unknown>,
) {
  const menuItemId =
    typeof data.menuItemId === "string"
      ? data.menuItemId
      : typeof (data.menuItem as { connect?: { id?: string } } | undefined)
            ?.connect?.id === "string"
        ? (data.menuItem as { connect: { id: string } }).connect.id
        : null;

  if (!menuItemId) {
    return;
  }

  const found = await baseClient.menuItem.findFirst({
    where: { id: menuItemId, tenantId },
    select: { id: true },
  });

  if (!found) {
    throw new TenantIsolationError(
      `MenuItem ${menuItemId} does not belong to tenant ${tenantId}`,
    );
  }
}

export async function verifyTargetOwnership(
  baseClient: PrismaClient,
  model: string,
  where: Record<string, unknown> | undefined,
  tenantId: string,
) {
  if (!where) {
    throw new TenantIsolationError("Missing where clause on tenant mutation");
  }
  const delegateName = toDelegateName(model);
  const delegate = (
    baseClient as unknown as Record<
      string,
      {
        findFirst: (args: {
          where: Record<string, unknown>;
          select: { id: true };
        }) => Promise<{ id: string } | null>;
      }
    >
  )[delegateName];

  if (!delegate) {
    throw new TenantIsolationError(`Unknown model delegate: ${model}`);
  }

  const existing = await delegate.findFirst({
    where: { ...where, tenantId },
    select: { id: true },
  });

  if (!existing) {
    throw new TenantIsolationError(
      `Target ${model} record does not exist or belongs to another tenant`,
    );
  }
}
