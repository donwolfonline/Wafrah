"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  extractLeadFieldErrors,
  getBranchesBand,
  pilotLeadFormSchema,
  type LeadCityValue,
  type LeadFieldErrors,
  type LeadFieldName,
  type LeadPosValue,
} from "@/features/leads/schema";
import type { AppLocale } from "@/i18n/request";
import { track } from "@/lib/analytics";
import { toWesternDigits } from "@/lib/format";
import { CheckCircleIcon } from "./landing-icons";
import {
  type LeadFormFieldsState,
  PilotLeadFormFields,
} from "./pilot-lead-form-fields";
import { WhatsAppButton } from "./whatsapp-button";

interface PilotLeadFormProps {
  locale: AppLocale;
  whatsappCtaLabel: string;
  whatsappPrefilledMessage: string;
}

const INITIAL_VALUES: LeadFormFieldsState = {
  name: "",
  businessName: "",
  city: "RIYADH",
  cityOther: "",
  role: "",
  phone: "",
  email: "",
  branches: "1",
  posSystem: "FOODICS",
  consent: false,
};

const FIELD_ELEMENT_ID_ORDER: ReadonlyArray<
  readonly [LeadFieldName, string]
> = [
  ["name", "lead-name"],
  ["role", "lead-role"],
  ["businessName", "lead-business"],
  ["cityOther", "lead-city-other"],
  ["phone", "lead-phone"],
  ["branches", "lead-branches"],
  ["email", "lead-email"],
  ["consent", "lead-consent"],
];

function focusFirstInvalidField(errors: LeadFieldErrors) {
  if (typeof document === "undefined") return;
  for (const [field, elementId] of FIELD_ELEMENT_ID_ORDER) {
    if (!errors[field]) continue;
    requestAnimationFrame(() => {
      document.getElementById(elementId)?.focus();
    });
    break;
  }
}

function readUtmParamsFromLocation() {
  if (typeof window === "undefined") {
    return { utmSource: "", utmMedium: "", utmCampaign: "" };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source")?.trim() ?? "",
    utmMedium: params.get("utm_medium")?.trim() ?? "",
    utmCampaign: params.get("utm_campaign")?.trim() ?? "",
  };
}

export function PilotLeadForm({
  locale,
  whatsappCtaLabel,
  whatsappPrefilledMessage,
}: PilotLeadFormProps) {
  const t = useTranslations("landing.leadForm");
  const startedAtRef = useRef<number | null>(null);
  const successCardRef = useRef<HTMLDivElement | null>(null);

  const [values, setValues] = useState<LeadFormFieldsState>(INITIAL_VALUES);
  const [hpContactNote, setHpContactNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LeadFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (submitted) {
      successCardRef.current?.focus();
    }
  }, [submitted]);

  function updateField<K extends keyof LeadFormFieldsState>(
    field: K,
    value: LeadFormFieldsState[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function clearFieldError(field: LeadFieldName) {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    const apiCity: LeadCityValue =
      values.city === "RIYADH" ? "OTHER" : values.city;
    const apiCityOther =
      values.city === "RIYADH"
        ? locale === "en"
          ? "Riyadh"
          : "الرياض"
        : values.city === "OTHER"
          ? values.cityOther
          : "";
    const candidate = {
      ...values,
      city: apiCity,
      cityOther: apiCityOther,
    };
    const parsed = pilotLeadFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const nextErrors = extractLeadFieldErrors(parsed.error.issues);
      setFieldErrors(nextErrors);
      focusFirstInvalidField(nextErrors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...candidate,
          locale,
          hpContactNote,
          startedAt: startedAtRef.current ?? Date.now(),
          ...readUtmParamsFromLocation(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        errorCode?: string;
        fieldErrors?: LeadFieldErrors;
        honeypotIgnored?: boolean;
        deduplicated?: boolean;
        city?: LeadCityValue;
        posSystem?: LeadPosValue;
        branchesBand?: string;
      };

      if (!response.ok || !payload.ok) {
        if (payload.fieldErrors) {
          setFieldErrors(payload.fieldErrors);
          focusFirstInvalidField(payload.fieldErrors);
        }
        if (payload.errorCode === "submittedTooFast") {
          setFormError(t("errors.submittedTooFast"));
        } else if (
          response.status === 429 ||
          payload.errorCode === "tooManyRequests"
        ) {
          setFormError(t("errors.tooManyRequests"));
        } else if (!payload.fieldErrors) {
          setFormError(t("errors.submitFailed"));
        }
        return;
      }

      if (!payload.honeypotIgnored) {
        const numericBranches = Number.parseInt(
          toWesternDigits(values.branches),
          10,
        );
        track("lead_submit", {
          locale,
          city: payload.city ?? apiCity,
          currentPos: payload.posSystem ?? values.posSystem,
          branchesBand:
            payload.branchesBand ??
            getBranchesBand(Number.isFinite(numericBranches) ? numericBranches : 1),
          deduplicated: Boolean(payload.deduplicated),
        });
      }
      setSubmitted(true);
    } catch {
      setFormError(t("errors.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card
        ref={successCardRef}
        id="pilot-form-success"
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="border-brand-mid-teal/40 bg-white py-6 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
      >
        <CardContent className="space-y-5 px-6 text-start">
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-brand-light-tint text-brand-dark-teal">
            <CheckCircleIcon className="size-7" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-brand-dark-teal">
              {t("successTitle")}
            </h3>
            <p className="text-sm leading-relaxed text-brand-text sm:text-base">
              {t("successDescription")}
            </p>
          </div>
          <WhatsAppButton
            locale={locale}
            location="form_success"
            variant="finalCta"
            label={whatsappCtaLabel || t("whatsappFallbackCta")}
            prefilledMessage={whatsappPrefilledMessage}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-brand-mid-teal/35 bg-white py-6 shadow-sm">
      <CardContent className="px-5 sm:px-6">
        <form
          id="pilot-form"
          onSubmit={handleSubmit}
          noValidate
          className="relative space-y-4 text-start"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-[9999px] h-px w-px overflow-hidden opacity-0"
          >
            <input
              name="hpContactNote"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={hpContactNote}
              onChange={(e) => setHpContactNote(e.target.value)}
            />
          </div>

          <PilotLeadFormFields
            values={values}
            fieldErrors={fieldErrors}
            t={(key) => t(key)}
            onFieldChange={updateField}
            onClearError={clearFieldError}
          />

          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
            >
              {formError}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full bg-brand-dark-teal text-base font-bold text-white hover:bg-brand-mid-teal"
          >
            {submitting ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                />
                <span>{t("submitting")}</span>
              </>
            ) : (
              <span>{t("submit")}</span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
