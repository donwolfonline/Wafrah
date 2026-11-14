"use client";

import type { HTMLInputTypeAttribute } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LabeledLeadInputProps {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  errorMessage: string | null;
  type?: HTMLInputTypeAttribute;
  inputMode?: "text" | "tel" | "email" | "numeric";
  dir?: "ltr";
  autoComplete?: string;
  required?: boolean;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}

export function LabeledLeadInput({
  id,
  name,
  label,
  placeholder,
  value,
  errorMessage,
  type = "text",
  inputMode,
  dir,
  autoComplete,
  required,
  min,
  max,
  onChange,
}: LabeledLeadInputProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        dir={dir}
        autoComplete={autoComplete}
        required={required}
        min={min}
        max={max}
        className="min-h-11 text-start text-base"
        placeholder={placeholder}
        value={value}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

interface LeadRadioOption<T extends string> {
  value: T;
  label: string;
  testId: string;
}

interface LeadRadioGroupProps<T extends string> {
  labelId: string;
  label: string;
  value: T;
  columnsClassName: string;
  alignClassName: string;
  options: ReadonlyArray<LeadRadioOption<T>>;
  onSelect: (nextValue: T) => void;
}

export function LeadRadioGroup<T extends string>({
  labelId,
  label,
  value,
  columnsClassName,
  alignClassName,
  options,
  onSelect,
}: LeadRadioGroupProps<T>) {
  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{label}</Label>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={`grid gap-2 ${columnsClassName}`}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={option.testId}
              onClick={() => onSelect(option.value)}
              className={`min-h-11 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal ${alignClassName} ${
                selected
                  ? "border-brand-dark-teal bg-brand-dark-teal text-white"
                  : "border-border bg-white text-brand-text hover:bg-brand-light-tint"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
