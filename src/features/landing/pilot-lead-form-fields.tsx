"use client";

import Link from "next/link";
import {
  LEAD_CITY_VALUES,
  LEAD_POS_VALUES,
  type LeadCityValue,
  type LeadFieldErrors,
  type LeadFieldName,
  type LeadPosValue,
} from "@/features/leads/schema";
import { LabeledLeadInput, LeadRadioGroup } from "./lead-form-controls";

const CITY_KEY: Record<LeadCityValue, "makkah" | "jeddah" | "other"> = {
  MAKKAH: "makkah",
  JEDDAH: "jeddah",
  OTHER: "other",
};

const POS_KEY: Record<LeadPosValue, "foodics" | "marn" | "other" | "none"> = {
  FOODICS: "foodics",
  MARN: "marn",
  OTHER: "other",
  NONE: "none",
};

export interface LeadFormFieldsState {
  name: string;
  businessName: string;
  city: LeadCityValue;
  cityOther: string;
  role: string;
  phone: string;
  email: string;
  branches: string;
  posSystem: LeadPosValue;
  consent: boolean;
}

interface PilotLeadFormFieldsProps {
  values: LeadFormFieldsState;
  fieldErrors: LeadFieldErrors;
  t: (key: string) => string;
  onFieldChange: <K extends keyof LeadFormFieldsState>(
    field: K,
    value: LeadFormFieldsState[K],
  ) => void;
  onClearError: (field: LeadFieldName) => void;
}

export function PilotLeadFormFields({
  values,
  fieldErrors,
  t,
  onFieldChange,
  onClearError,
}: PilotLeadFormFieldsProps) {
  const err = (field: LeadFieldName) =>
    fieldErrors[field] ? t(`errors.${fieldErrors[field]}`) : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledLeadInput
          id="lead-name"
          name="name"
          label={t("fields.name.label")}
          placeholder={t("fields.name.placeholder")}
          autoComplete="name"
          required
          value={values.name}
          errorMessage={err("name")}
          onChange={(v) => {
            onFieldChange("name", v);
            onClearError("name");
          }}
        />
        <LabeledLeadInput
          id="lead-role"
          name="role"
          label={t("fields.role.label")}
          placeholder={t("fields.role.placeholder")}
          autoComplete="organization-title"
          required
          value={values.role}
          errorMessage={err("role")}
          onChange={(v) => {
            onFieldChange("role", v);
            onClearError("role");
          }}
        />
      </div>

      <LabeledLeadInput
        id="lead-business"
        name="businessName"
        label={t("fields.restaurantName.label")}
        placeholder={t("fields.restaurantName.placeholder")}
        autoComplete="organization"
        required
        value={values.businessName}
        errorMessage={err("businessName")}
        onChange={(v) => {
          onFieldChange("businessName", v);
          onClearError("businessName");
        }}
      />

      <LeadRadioGroup
        labelId="lead-city-label"
        label={t("fields.city.label")}
        value={values.city}
        columnsClassName="grid-cols-3"
        alignClassName="text-center"
        options={LEAD_CITY_VALUES.map((option) => ({
          value: option,
          label: t(`fields.city.options.${CITY_KEY[option]}`),
          testId: `lead-city-${option}`,
        }))}
        onSelect={(option) => {
          onFieldChange("city", option);
          onClearError("city");
          if (option !== "OTHER") onClearError("cityOther");
        }}
      />

      {values.city === "OTHER" ? (
        <LabeledLeadInput
          id="lead-city-other"
          name="cityOther"
          label={t("fields.cityOther.label")}
          placeholder={t("fields.cityOther.placeholder")}
          required
          value={values.cityOther}
          errorMessage={err("cityOther")}
          onChange={(v) => {
            onFieldChange("cityOther", v);
            onClearError("cityOther");
          }}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledLeadInput
          id="lead-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          required
          label={t("fields.phone.label")}
          placeholder={t("fields.phone.placeholder")}
          value={values.phone}
          errorMessage={err("phone")}
          onChange={(v) => {
            onFieldChange("phone", v);
            onClearError("phone");
          }}
        />
        <LabeledLeadInput
          id="lead-branches"
          name="branches"
          type="number"
          inputMode="numeric"
          dir="ltr"
          min={1}
          max={500}
          required
          label={t("fields.branchesCount.label")}
          placeholder={t("fields.branchesCount.placeholder")}
          value={values.branches}
          errorMessage={err("branches")}
          onChange={(v) => {
            onFieldChange("branches", v);
            onClearError("branches");
          }}
        />
      </div>

      <LabeledLeadInput
        id="lead-email"
        name="email"
        type="email"
        inputMode="email"
        dir="ltr"
        autoComplete="email"
        label={t("fields.email.label")}
        placeholder={t("fields.email.placeholder")}
        value={values.email}
        errorMessage={err("email")}
        onChange={(v) => {
          onFieldChange("email", v);
          onClearError("email");
        }}
      />

      <LeadRadioGroup
        labelId="lead-pos-label"
        label={t("fields.currentPos.label")}
        value={values.posSystem}
        columnsClassName="grid-cols-2"
        alignClassName="text-start"
        options={LEAD_POS_VALUES.map((option) => ({
          value: option,
          label: t(`fields.currentPos.options.${POS_KEY[option]}`),
          testId: `lead-pos-${option}`,
        }))}
        onSelect={(option) => {
          onFieldChange("posSystem", option);
          onClearError("posSystem");
        }}
      />

      <div className="space-y-1.5 pt-1">
        <label
          htmlFor="lead-consent"
          className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-relaxed ${
            err("consent") ? "border-destructive bg-destructive/5" : "border-border bg-brand-light-tint/50"
          }`}
        >
          <input
            id="lead-consent"
            name="consent"
            type="checkbox"
            checked={values.consent}
            aria-invalid={Boolean(err("consent"))}
            aria-describedby={err("consent") ? "lead-consent-error" : undefined}
            onChange={(e) => {
              onFieldChange("consent", e.target.checked);
              onClearError("consent");
            }}
            className="mt-0.5 size-5 shrink-0 rounded accent-[#0B4F45]"
          />
          <span className="text-brand-text">
            {t("fields.consent.labelPrefix")}
            <Link
              href="/privacy"
              className="font-semibold text-brand-dark-teal underline underline-offset-2 hover:text-brand-mid-teal"
            >
              {t("fields.consent.privacyLinkText")}
            </Link>
            {t("fields.consent.labelSuffix")}
          </span>
        </label>
        {err("consent") ? (
          <p id="lead-consent-error" role="alert" className="text-xs font-medium text-destructive">
            {err("consent")}
          </p>
        ) : null}
      </div>
    </>
  );
}
