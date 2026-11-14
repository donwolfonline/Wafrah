import type { Prisma } from "@prisma/client";
import { platformAdminDb } from "@/lib/db";

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
    if (process.env.NODE_ENV !== "test") {
      console.error("Failed to record audit log:", error);
    }
  }
}
