import type { Prisma } from "@prisma/client";
import { env } from "@/env";
import { platformAdminDb } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface AuditLogInput {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
}

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await platformAdminDb.auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? "unknown",
        metadata: input.metadata ?? {},
      },
    });
  } catch (error) {
    if (env.NODE_ENV !== "test") {
      logger.error("audit.record_failed", {
        tenantId: input.tenantId ?? null,
        action: input.action,
        entity: input.entity,
        error,
      });
    }
  }
}
