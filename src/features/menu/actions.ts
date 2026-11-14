"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
} from "@/lib/api-rate-limit";
import { requireRole, type SessionUser } from "@/lib/authz";
import type { MenuValidationErrorCode } from "./schemas";
import {
  createMenuItemForTenant,
  importMenuItemsForTenant,
  type SerializedMenuItem,
  setMenuItemActiveForTenant,
  updateMenuItemForTenant,
} from "./service";

export type MenuMutationResult =
  | { ok: true; item: SerializedMenuItem }
  | {
      ok: false;
      errorKey: MenuValidationErrorCode | "actionFailed";
    };

export type MenuBatchImportResult =
  { ok: true; importedCount: number } | { ok: false; errorKey: "actionFailed" };

function extractFirstErrorKey(
  error: unknown,
): MenuValidationErrorCode | "actionFailed" {
  if (error instanceof ZodError) {
    const msg = error.issues[0]?.message;
    if (
      msg === "nameRequired" ||
      msg === "categoryRequired" ||
      msg === "invalidUnit" ||
      msg === "invalidUnitCost" ||
      msg === "invalidShortageCost"
    ) {
      return msg;
    }
  }
  return "actionFailed";
}

async function authorizeMenuMutation(): Promise<SessionUser | null> {
  const user = await requireRole("menu.manage");
  const rate = checkApiWriteRateLimit(
    buildApiRateLimitKey({ userId: user.userId, scope: "menu-action-write" }),
  );
  return rate.allowed ? user : null;
}

export async function createMenuItemAction(
  rawInput: unknown,
): Promise<MenuMutationResult> {
  try {
    const user = await authorizeMenuMutation();
    if (!user) return { ok: false, errorKey: "actionFailed" };
    const item = await createMenuItemForTenant(rawInput, user);
    revalidatePath("/menu");
    return { ok: true, item };
  } catch (error) {
    return { ok: false, errorKey: extractFirstErrorKey(error) };
  }
}

export async function updateMenuItemAction(
  rawInput: unknown,
): Promise<MenuMutationResult> {
  try {
    const user = await authorizeMenuMutation();
    if (!user) return { ok: false, errorKey: "actionFailed" };
    const item = await updateMenuItemForTenant(rawInput, user);
    revalidatePath("/menu");
    return { ok: true, item };
  } catch (error) {
    return { ok: false, errorKey: extractFirstErrorKey(error) };
  }
}

export async function toggleMenuItemActiveAction(
  rawInput: unknown,
): Promise<MenuMutationResult> {
  try {
    const user = await authorizeMenuMutation();
    if (!user) return { ok: false, errorKey: "actionFailed" };
    const item = await setMenuItemActiveForTenant(rawInput, user);
    revalidatePath("/menu");
    return { ok: true, item };
  } catch (error) {
    return { ok: false, errorKey: extractFirstErrorKey(error) };
  }
}

export async function importMenuItemsAction(
  rawInput: unknown,
): Promise<MenuBatchImportResult> {
  try {
    const user = await authorizeMenuMutation();
    if (!user) return { ok: false, errorKey: "actionFailed" };
    const result = await importMenuItemsForTenant(rawInput, user);
    revalidatePath("/menu");
    return { ok: true, importedCount: result.importedCount };
  } catch {
    return { ok: false, errorKey: "actionFailed" };
  }
}
