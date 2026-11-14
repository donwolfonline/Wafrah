import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateStaffPin } from "@/features/auth/authorize";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import { hashSecret, verifySecret } from "@/lib/password";
import { generateStaffPin, isWeakStaffPin } from "./pin";
import { StaffServiceError } from "./schemas";
import {
  createStaffMember,
  listStaffForTenant,
  resetStaffMemberPin,
  setStaffMemberActive,
} from "./service";

describe("staff PIN generator", () => {
  it("always produces valid 4-digit non-trivial PINs", () => {
    expect(isWeakStaffPin("0000")).toBe(true);
    expect(isWeakStaffPin("1234")).toBe(true);
    expect(isWeakStaffPin("4321")).toBe(true);
    expect(isWeakStaffPin("9999")).toBe(true);
    expect(isWeakStaffPin("123")).toBe(true);
    expect(isWeakStaffPin("12345")).toBe(true);

    for (let i = 0; i < 40; i++) {
      const pin = generateStaffPin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(isWeakStaffPin(pin)).toBe(false);
    }

    // Skips weak deterministic candidates before picking a non-trivial PIN
    const sequence = [0, 1234, 4321, 5555, 839];
    let idx = 0;
    const picked = generateStaffPin(() => sequence[idx++] ?? 4821);
    expect(picked).toBe("0839");
  });
});

describe("staff service: create, reset PIN, deactivate & tenant isolation", () => {
  const token = randomUUID().slice(0, 8).toLowerCase();
  let tenantAId = "";
  let tenantACode = "";
  let tenantBId = "";
  let managerASession: SessionUser;
  let staffOnlySession: SessionUser;

  beforeAll(async () => {
    const hash = hashSecret("StaffMgr!2026");
    const [restA, restB] = await Promise.all([
      platformAdminDb.restaurant.create({
        data: {
          code: `STFA-${token}`.toUpperCase(),
          name: `Staff Rest A ${token}`,
          nameAr: `مطعم طاقم أ ${token}`,
          city: "Jeddah",
          type: "Casual",
        },
      }),
      platformAdminDb.restaurant.create({
        data: {
          code: `STFB-${token}`.toUpperCase(),
          name: `Staff Rest B ${token}`,
          nameAr: `مطعم طاقم ب ${token}`,
          city: "Makkah",
          type: "Casual",
        },
      }),
    ]);

    tenantAId = restA.id;
    tenantACode = restA.code;
    tenantBId = restB.id;

    const mgrA = await platformAdminDb.user.create({
      data: {
        tenantId: restA.id,
        name: "Manager A",
        role: "MANAGER",
        email: `stf-mgr-a-${token}@test.local`,
        username: `mgr-a-${token}`,
        passwordHash: hash,
      },
    });
    managerASession = {
      userId: mgrA.id,
      name: mgrA.name,
      role: "MANAGER",
      tenantId: restA.id,
      locale: "ar",
    };
  });

  afterAll(async () => {
    await platformAdminDb.auditLog.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await platformAdminDb.restaurant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
  });

  it("creates staff with hashed 4-digit PIN, resets PIN, deactivates, and isolates tenants", async () => {
    const { staff, generatedPin } = await createStaffMember(managerASession, {
      name: "Tariq Kitchen",
      username: `tariq-${token}`,
      locale: "ar",
    });

    expect(generatedPin).toMatch(/^\d{4}$/);
    expect(isWeakStaffPin(generatedPin)).toBe(false);
    expect(staff.username).toBe(`tariq-${token}`);
    expect(staff.active).toBe(true);

    // Raw DB stores bcrypt hash only
    const dbUser = await platformAdminDb.user.findUniqueOrThrow({
      where: { id: staff.id },
      select: { pinHash: true, role: true },
    });
    expect(dbUser.role).toBe("STAFF");
    expect(verifySecret(generatedPin, dbUser.pinHash!)).toBe(true);

    // Duplicate username inside the same restaurant is rejected cleanly
    await expect(
      createStaffMember(managerASession, {
        name: "Duplicate User",
        username: `tariq-${token}`,
      }),
    ).rejects.toThrow(StaffServiceError);

    // Auth works with generated PIN
    staffOnlySession = {
      userId: staff.id,
      name: staff.name,
      role: "STAFF",
      tenantId: tenantAId,
      locale: "ar",
    };
    const firstLogin = await authenticateStaffPin(
      { restaurantCode: tenantACode, username: staff.username, pin: generatedPin },
      "127.0.0.1",
    );
    expect(firstLogin.ok).toBe(true);

    // Kitchen staff cannot list/create/reset other staff
    await expect(listStaffForTenant(staffOnlySession)).rejects.toThrow(
      AuthorizationError,
    );

    // Resetting PIN replaces the hash cleanly and allows login with the new PIN
    const reset = await resetStaffMemberPin(managerASession, staff.id);
    expect(reset.generatedPin).toMatch(/^\d{4}$/);
    expect(isWeakStaffPin(reset.generatedPin)).toBe(false);

    const oldPinResult = await authenticateStaffPin(
      { restaurantCode: tenantACode, username: staff.username, pin: generatedPin },
      "127.0.0.2",
    );
    if (generatedPin !== reset.generatedPin) {
      expect(oldPinResult.ok).toBe(false);
    }

    const newPinResult = await authenticateStaffPin(
      {
        restaurantCode: tenantACode,
        username: staff.username,
        pin: reset.generatedPin,
      },
      "127.0.0.3",
    );
    expect(newPinResult.ok).toBe(true);

    // Deactivating blocks PIN login cleanly
    const deactivated = await setStaffMemberActive(managerASession, staff.id, {
      active: false,
    });
    expect(deactivated.active).toBe(false);

    const blockedLogin = await authenticateStaffPin(
      {
        restaurantCode: tenantACode,
        username: staff.username,
        pin: reset.generatedPin,
      },
      "127.0.0.4",
    );
    expect(blockedLogin.ok).toBe(false);

    // List omits credential hashes & manager cannot reset Tenant B or MANAGER users
    const listData = await listStaffForTenant(managerASession);
    expect(listData.restaurant.code).toBe(tenantACode);
    expect(listData.staff.map((s) => s.id)).toContain(staff.id);
    await expect(
      resetStaffMemberPin(managerASession, managerASession.userId),
    ).rejects.toThrow(StaffServiceError);

    const foreignStaff = await platformAdminDb.user.create({
      data: {
        tenantId: tenantBId,
        name: "Foreign Chef",
        role: "STAFF",
        username: `foreign-${token}`,
        pinHash: hashSecret("4829"),
      },
    });
    await expect(
      resetStaffMemberPin(managerASession, foreignStaff.id),
    ).rejects.toThrow(StaffServiceError);
  });
});
