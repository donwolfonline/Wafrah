import { z } from "zod";

export const staffIdSchema = z
  .string()
  .trim()
  .min(1, "Staff ID is required")
  .max(128, "Invalid staff ID")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid staff ID");

export const createStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Staff name must be at least 2 characters")
    .max(80, "Staff name must be at most 80 characters"),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{1,31}$/,
      "Username must be 2-32 lowercase letters, numbers, dots, underscores, or hyphens",
    ),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffStatusSchema = z.object({
  active: z.boolean(),
});

export type UpdateStaffStatusInput = z.infer<typeof updateStaffStatusSchema>;

export interface StaffMemberDto {
  id: string;
  name: string;
  username: string;
  locale: "ar" | "en";
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StaffRestaurantContext {
  id: string;
  code: string;
  name: string;
  nameAr: string;
}

export interface StaffPageData {
  restaurant: StaffRestaurantContext;
  staff: StaffMemberDto[];
  loginPath: string;
}

export class StaffServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "StaffServiceError";
    this.statusCode = statusCode;
  }
}
