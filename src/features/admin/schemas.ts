import { z } from "zod";

export const SubscriptionPlanEnum = z.enum(["SMALL", "MEDIUM", "CHAIN"]);

export const SubscriptionStatusEnum = z.enum([
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "SUSPENDED",
]);

export const restaurantIdSchema = z
  .string()
  .trim()
  .min(1, "Restaurant ID is required")
  .max(128, "Invalid restaurant ID")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid restaurant ID");

export const createRestaurantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  type: z.string().trim().min(2).max(80),
  plan: SubscriptionPlanEnum,
  managerName: z.string().trim().min(2).max(100),
  managerEmail: z.string().trim().toLowerCase().email().max(160),
  managerLocale: z.enum(["ar", "en"]).optional().default("ar"),
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;

export const updateSubscriptionSchema = z.object({
  plan: SubscriptionPlanEnum,
  status: SubscriptionStatusEnum,
  renewsAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") {
          return true;
        }
        const parsed = new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}T00:00:00.000Z` : val,
        );
        return !Number.isNaN(parsed.getTime());
      },
      { message: "Invalid renewsAt date" },
    ),
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const suspendRestaurantSchema = z.object({
  action: z.enum(["suspend", "reactivate"]),
});

export type SuspendRestaurantInput = z.infer<typeof suspendRestaurantSchema>;

export const deleteRestaurantSchema = z.object({
  confirmName: z.string().trim().min(1).max(200),
});

export type DeleteRestaurantInput = z.infer<typeof deleteRestaurantSchema>;

export function parseRenewDateInput(
  value: string | null | undefined,
): Date | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new AdminServiceError("Invalid renewsAt date", 400);
  }
  return parsed;
}

export class AdminServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminServiceError";
    this.statusCode = statusCode;
  }
}
