import { z } from "zod";

export const managerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().trim().min(1),
});

export const staffPinLoginSchema = z.object({
  restaurantCode: z.string().trim().toUpperCase().min(2).max(32),
  username: z.string().trim().toLowerCase().min(1).max(64),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
});

export type ManagerLoginInput = z.infer<typeof managerLoginSchema>;
export type StaffPinLoginInput = z.infer<typeof staffPinLoginSchema>;
