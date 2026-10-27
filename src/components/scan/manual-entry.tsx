"use client";

import { useState, type FormEvent } from "react";
import { PenLine } from "lucide-react";

import { validatePrescription } from "@/lib/validation";
import type { PrescriptionFieldErrors, PrescriptionInput } from "@/types/prescription";

const FIELDS: {
  name: keyof PrescriptionInput;
  label: string;
  placeholder: string;
  autoComplete: string;
  hint: string;
}[] = [
  {
    name: "med",
    label: "Medication",
    placeholder: "e.g. Amoxicillin",
    autoComplete: "off",
    hint: "The name printed on the prescription.",
  },
  {
    name: "dose",
    label: "Dose",
    placeholder: "e.g. 500mg",
    autoComplete: "off",
    hint: "Include the amount and unit.",
  },
  {
    name: "duration",
    label: "Duration",
    placeholder: "e.g. 7 days",
    autoComplete: "off",
    hint: "How long the course lasts.",
  },
];

export function ManualEntry({ onSubmit }: { onSubmit: (input: PrescriptionInput) => void }) {
  const [values, setValues] = useState<PrescriptionInput>({ med: "", dose: "", duration: "" });
  const [errors, setErrors] = useState<PrescriptionFieldErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validation = validatePrescription(values);
    if (!validation.ok) {
      setErrors(validation.errors);
      const first = document.getElementById(`manual-${Object.keys(validation.errors)[0]}`);
      first?.focus();
      return;
    }
    setErrors({});
    onSubmit(validation.value);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <label htmlFor={`manual-${field.name}`} className="mb-1.5 block text-sm font-semibold text-ink">
              {field.label}
            </label>
            <input
              id={`manual-${field.name}`}
              name={field.name}
              value={values[field.name]}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              placeholder={field.placeholder}
              autoComplete={field.autoComplete}
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={errors[field.name] ? `manual-${field.name}-error` : `manual-${field.name}-hint`}
              className="field"
              inputMode="text"
              maxLength={120}
            />
            {errors[field.name] ? (
              <p id={`manual-${field.name}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors[field.name]}
              </p>
            ) : (
              <p id={`manual-${field.name}-hint`} className="mt-1.5 text-xs text-muted">
                {field.hint}
              </p>
            )}
          </div>
        ))}
      </div>

      <button type="submit" className="btn btn-primary min-h-12 w-full sm:w-auto">
        <PenLine className="size-4" aria-hidden />
        Review details
      </button>
    </form>
  );
}
