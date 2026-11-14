import { z } from "zod";
import { toWesternDigits } from "@/lib/format";

export const LEAD_CITY_VALUES = ["MAKKAH", "JEDDAH", "OTHER"] as const;
export type LeadCityValue = (typeof LEAD_CITY_VALUES)[number];

export const LEAD_POS_VALUES = ["FOODICS", "MARN", "OTHER", "NONE"] as const;
export type LeadPosValue = (typeof LEAD_POS_VALUES)[number];

export const LEAD_STATUS_VALUES = [
  "NEW",
  "CONTACTED",
  "PILOT",
  "NOT_FIT",
] as const;
export type LeadStatusValue = (typeof LEAD_STATUS_VALUES)[number];

export type LeadFieldName =
  | "name"
  | "businessName"
  | "city"
  | "cityOther"
  | "role"
  | "phone"
  | "email"
  | "branches"
  | "posSystem"
  | "consent";

export type LeadFormErrorCode =
  | "requiredField"
  | "cityOtherRequired"
  | "invalidPhone"
  | "invalidEmail"
  | "invalidBranches"
  | "consentRequired";

export type LeadFieldErrors = Partial<Record<LeadFieldName, LeadFormErrorCode>>;

const SAUDI_NORMALIZED_PHONE_RE = /^\+9665\d{8}$/;
const INVISIBLE_DIRECTION_CHARS_RE = /[\s\-().\u200E\u200F\u061C]+/g;

/**
 * Normalizes Saudi mobile formats (`05XXXXXXXX`, `5XXXXXXXX`, `+9665XXXXXXXX`,
 * `009665XXXXXXXX`, including Arabic-Indic numerals and spaces/hyphens)
 * to canonical E.164 `+9665XXXXXXXX`. Returns null when invalid.
 */
export function normalizeSaudiMobilePhone(raw: string): string | null {
  const western = toWesternDigits(raw ?? "").trim();
  if (!western) {
    return null;
  }

  const compact = western.replace(INVISIBLE_DIRECTION_CHARS_RE, "");
  let candidate: string;

  if (compact.startsWith("00966")) {
    candidate = `+966${compact.slice(5)}`;
  } else if (compact.startsWith("+966")) {
    candidate = compact;
  } else if (/^05\d{8}$/.test(compact)) {
    candidate = `+966${compact.slice(1)}`;
  } else if (/^5\d{8}$/.test(compact)) {
    candidate = `+966${compact}`;
  } else {
    return null;
  }

  return SAUDI_NORMALIZED_PHONE_RE.test(candidate) ? candidate : null;
}

function optionalTrimmedString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, "requiredField")
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    });
}

export const pilotLeadFormSchema = z
  .object({
    name: z
      .string({ required_error: "requiredField", invalid_type_error: "requiredField" })
      .trim()
      .min(2, "requiredField")
      .max(120, "requiredField"),
    businessName: z
      .string({ required_error: "requiredField", invalid_type_error: "requiredField" })
      .trim()
      .min(2, "requiredField")
      .max(160, "requiredField"),
    city: z.enum(LEAD_CITY_VALUES, {
      required_error: "requiredField",
      invalid_type_error: "requiredField",
    }),
    cityOther: optionalTrimmedString(120),
    role: z
      .string({ required_error: "requiredField", invalid_type_error: "requiredField" })
      .trim()
      .min(2, "requiredField")
      .max(120, "requiredField"),
    phone: z
      .string({ required_error: "requiredField", invalid_type_error: "requiredField" })
      .trim()
      .min(1, "requiredField")
      .max(40, "invalidPhone")
      .transform((value, ctx) => {
        const normalized = normalizeSaudiMobilePhone(value);
        if (!normalized) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "invalidPhone",
          });
          return z.NEVER;
        }
        return normalized;
      }),
    email: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((value) => (typeof value === "string" ? value.trim() : ""))
      .superRefine((value, ctx) => {
        if (!value) {
          return;
        }
        if (value.length > 180 || !z.string().email().safeParse(value).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "invalidEmail",
          });
        }
      })
      .transform((value) => (value ? value.toLowerCase() : null)),
    branches: z
      .union([z.number(), z.string()])
      .transform((value) => {
        if (typeof value === "number") {
          return value;
        }
        const normalized = toWesternDigits(value).trim();
        if (!/^\d+$/.test(normalized)) {
          return Number.NaN;
        }
        return Number.parseInt(normalized, 10);
      })
      .refine((value) => Number.isInteger(value) && value >= 1 && value <= 500, {
        message: "invalidBranches",
      }),
    posSystem: z.enum(LEAD_POS_VALUES, {
      required_error: "requiredField",
      invalid_type_error: "requiredField",
    }),
    consent: z
      .boolean({ required_error: "consentRequired", invalid_type_error: "consentRequired" })
      .refine((value) => value === true, {
        message: "consentRequired",
      }),
  })
  .superRefine((data, ctx) => {
    if (data.city === "OTHER" && !data.cityOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cityOther"],
        message: "cityOtherRequired",
      });
    }
  });

export const pilotLeadSubmissionSchema = pilotLeadFormSchema.and(
  z.object({
    locale: z.enum(["ar", "en"]).default("ar"),
    hpContactNote: z.string().max(200).optional(),
    startedAt: z.number().finite().optional(),
    utmSource: optionalTrimmedString(120),
    utmMedium: optionalTrimmedString(120),
    utmCampaign: optionalTrimmedString(120),
  }),
);

export type PilotLeadFormInput = z.input<typeof pilotLeadFormSchema>;
export type PilotLeadFormValidated = z.output<typeof pilotLeadFormSchema>;
export type PilotLeadSubmissionValidated = z.output<
  typeof pilotLeadSubmissionSchema
>;

export function extractLeadFieldErrors(
  issues: readonly z.ZodIssue[],
): LeadFieldErrors {
  const fieldErrors: LeadFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in fieldErrors) {
      continue;
    }
    const validFieldNames: ReadonlySet<string> = new Set([
      "name",
      "businessName",
      "city",
      "cityOther",
      "role",
      "phone",
      "email",
      "branches",
      "posSystem",
      "consent",
    ]);
    if (!validFieldNames.has(field)) {
      continue;
    }
    const code = issue.message as LeadFormErrorCode;
    fieldErrors[field as LeadFieldName] = code;
  }
  return fieldErrors;
}

export function getBranchesBand(branches: number): "1" | "2-5" | "6+" {
  if (branches <= 1) {
    return "1";
  }
  if (branches <= 5) {
    return "2-5";
  }
  return "6+";
}

export const adminLeadFilterSchema = z.object({
  status: z.enum(LEAD_STATUS_VALUES).optional(),
  city: z.enum(LEAD_CITY_VALUES).optional(),
  search: z.string().trim().max(120).optional(),
});

export const adminLeadUpdateSchema = z
  .object({
    status: z.enum(LEAD_STATUS_VALUES).optional(),
    notes: z
      .union([z.string().max(2000), z.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) {
          return undefined;
        }
        if (value === null) {
          return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }),
  })
  .refine(
    (payload) => payload.status !== undefined || payload.notes !== undefined,
    { message: "At least one lead field (status or notes) is required." },
  );
