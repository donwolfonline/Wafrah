import { Prisma } from "@prisma/client";
import { requireRole, type SessionUser } from "@/lib/authz";
import { hashSecret } from "@/lib/password";
import { buildPinAccountKey, resetPinRateLimit } from "@/lib/rate-limit";
import { getTenantDb } from "@/lib/tenant";
import { generateStaffPin } from "./pin";
import {
  createStaffSchema,
  type StaffMemberDto,
  type StaffPageData,
  StaffServiceError,
  staffIdSchema,
  updateStaffStatusSchema,
} from "./schemas";

function serializeStaff(row: {
  id: string;
  name: string;
  username: string;
  locale: string;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): StaffMemberDto {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    locale: row.locale === "en" ? "en" : "ar",
    active: row.active,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const STAFF_SELECT = {
  id: true,
  name: true,
  username: true,
  locale: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export function buildKitchenLoginPath(restaurantCode: string): string {
  return `/login?tab=staff&code=${encodeURIComponent(restaurantCode)}`;
}

export async function listStaffForTenant(
  sessionOverride?: SessionUser | null,
): Promise<StaffPageData> {
  const actor = await requireRole(["MANAGER", "OWNER"], sessionOverride);
  const db = await getTenantDb(actor);

  const [restaurant, staffRows] = await Promise.all([
    db.restaurant.findUniqueOrThrow({
      where: { id: actor.tenantId! },
      select: { id: true, code: true, name: true, nameAr: true },
    }),
    db.user.findMany({
      where: { role: "STAFF" },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: STAFF_SELECT,
    }),
  ]);

  return {
    restaurant,
    staff: staffRows.map(serializeStaff),
    loginPath: buildKitchenLoginPath(restaurant.code),
  };
}

export async function createStaffMember(
  sessionOverride: SessionUser | null | undefined,
  rawInput: unknown,
): Promise<{ staff: StaffMemberDto; generatedPin: string }> {
  const actor = await requireRole(["MANAGER", "OWNER"], sessionOverride);
  const db = await getTenantDb(actor);

  const parsed = createStaffSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new StaffServiceError(
      parsed.error.issues[0]?.message ?? "Invalid staff payload",
      400,
    );
  }

  const input = parsed.data;
  const existing = await db.user.findFirst({
    where: { username: input.username },
    select: { id: true },
  });
  if (existing) {
    throw new StaffServiceError("Username is already in use in this branch", 409);
  }

  const generatedPin = generateStaffPin();
  const pinHash = hashSecret(generatedPin);

  let created: {
    id: string;
    name: string;
    username: string;
    locale: string;
    active: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  };
  try {
    created = await db.user.create({
      data: {
        tenantId: actor.tenantId!,
        name: input.name,
        username: input.username,
        role: "STAFF",
        email: null,
        passwordHash: null,
        pinHash,
        locale: input.locale,
        active: true,
      },
      select: STAFF_SELECT,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new StaffServiceError("Username is already in use in this branch", 409);
    }
    throw error;
  }

  await db.auditLog.create({
    data: {
      tenantId: actor.tenantId!,
      userId: actor.userId,
      action: "STAFF_CREATED",
      entity: "User",
      entityId: created.id,
      metadata: {
        username: created.username,
        locale: created.locale,
      },
    },
  });

  return {
    staff: serializeStaff(created),
    generatedPin,
  };
}

export async function resetStaffMemberPin(
  sessionOverride: SessionUser | null | undefined,
  rawStaffId: string,
): Promise<{ staff: StaffMemberDto; generatedPin: string }> {
  const actor = await requireRole(["MANAGER", "OWNER"], sessionOverride);
  const parsedId = staffIdSchema.safeParse(rawStaffId);
  if (!parsedId.success) {
    throw new StaffServiceError("Invalid staff ID", 400);
  }

  const db = await getTenantDb(actor);
  const [restaurant, existing] = await Promise.all([
    db.restaurant.findUniqueOrThrow({
      where: { id: actor.tenantId! },
      select: { code: true },
    }),
    db.user.findFirst({
      where: { id: parsedId.data, role: "STAFF" },
      select: STAFF_SELECT,
    }),
  ]);

  if (!existing) {
    throw new StaffServiceError("Staff member not found", 404);
  }

  const generatedPin = generateStaffPin();
  const updated = await db.user.update({
    where: { id: existing.id },
    data: { pinHash: hashSecret(generatedPin) },
    select: STAFF_SELECT,
  });

  resetPinRateLimit({
    ip: "manager-reset",
    accountKey: buildPinAccountKey(restaurant.code, existing.username),
  });

  await db.auditLog.create({
    data: {
      tenantId: actor.tenantId!,
      userId: actor.userId,
      action: "STAFF_PIN_RESET",
      entity: "User",
      entityId: existing.id,
      metadata: {
        username: existing.username,
      },
    },
  });

  return {
    staff: serializeStaff(updated),
    generatedPin,
  };
}

export async function setStaffMemberActive(
  sessionOverride: SessionUser | null | undefined,
  rawStaffId: string,
  rawInput: unknown,
): Promise<StaffMemberDto> {
  const actor = await requireRole(["MANAGER", "OWNER"], sessionOverride);
  const parsedId = staffIdSchema.safeParse(rawStaffId);
  if (!parsedId.success) {
    throw new StaffServiceError("Invalid staff ID", 400);
  }

  const parsedInput = updateStaffStatusSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new StaffServiceError("Invalid status payload", 400);
  }

  const db = await getTenantDb(actor);
  const existing = await db.user.findFirst({
    where: { id: parsedId.data, role: "STAFF" },
    select: STAFF_SELECT,
  });
  if (!existing) {
    throw new StaffServiceError("Staff member not found", 404);
  }

  const updated = await db.user.update({
    where: { id: existing.id },
    data: { active: parsedInput.data.active },
    select: STAFF_SELECT,
  });

  await db.auditLog.create({
    data: {
      tenantId: actor.tenantId!,
      userId: actor.userId,
      action: parsedInput.data.active ? "STAFF_REACTIVATED" : "STAFF_DEACTIVATED",
      entity: "User",
      entityId: existing.id,
      metadata: {
        username: existing.username,
        active: parsedInput.data.active,
      },
    },
  });

  return serializeStaff(updated);
}
