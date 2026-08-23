"use client";

import { FormEvent, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CandidateCreatePayload } from "@/lib/types";

export interface CandidateFormValues {
  full_name: string;
  email: string;
  phone: string;
  position: string;
  linkedin_url: string;
  cv_url: string;
  experience_years: string;
}

interface CandidateFormProps {
  initialValues?: Partial<CandidateFormValues>;
  mode: "create" | "edit";
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (payload: CandidateCreatePayload) => Promise<void>;
}

type FormErrors = Partial<Record<keyof CandidateFormValues, string>>;

const urlPattern = /^https?:\/\/.+/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+\d[\d\s-]{6,}$/;

export function CandidateForm({
  initialValues,
  mode,
  submitLabel,
  pendingLabel,
  onSubmit,
}: CandidateFormProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<CandidateFormValues>({
    full_name: initialValues?.full_name || "",
    email: initialValues?.email || "",
    phone: initialValues?.phone || "",
    position: initialValues?.position || "",
    linkedin_url: initialValues?.linkedin_url || "",
    cv_url: initialValues?.cv_url || "",
    experience_years: initialValues?.experience_years || "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>("");

  const title = useMemo(
    () => (mode === "create" ? t.formCreateTitle : t.formEditTitle),
    [mode, t.formCreateTitle, t.formEditTitle],
  );

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!values.full_name.trim()) {
      nextErrors.full_name = t.fieldRequired;
    } else if (values.full_name.trim().split(/\s+/).length < 2) {
      nextErrors.full_name = t.fullNameError;
    }

    if (!values.email.trim()) {
      nextErrors.email = t.fieldRequired;
    } else if (!emailPattern.test(values.email.trim())) {
      nextErrors.email = t.emailError;
    }

    if (!values.phone.trim()) {
      nextErrors.phone = t.fieldRequired;
    } else if (!phonePattern.test(values.phone.trim())) {
      nextErrors.phone = t.phoneError;
    }

    if (!values.position.trim()) {
      nextErrors.position = t.fieldRequired;
    }

    if (!values.experience_years.trim()) {
      nextErrors.experience_years = t.fieldRequired;
    } else if (Number(values.experience_years) < 0 || Number.isNaN(Number(values.experience_years))) {
      nextErrors.experience_years = t.yearsError;
    }

    if (values.linkedin_url.trim() && !urlPattern.test(values.linkedin_url.trim())) {
      nextErrors.linkedin_url = t.urlError;
    }

    if (values.cv_url.trim() && !urlPattern.test(values.cv_url.trim())) {
      nextErrors.cv_url = t.urlError;
    }

    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const validation = validate();
    setErrors(validation);

    if (Object.keys(validation).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        position: values.position.trim(),
        linkedin_url: values.linkedin_url.trim() || null,
        cv_url: values.cv_url.trim() || null,
        experience_years: Number(values.experience_years),
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t.unknownError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-3xl border border-amber-900/15 bg-white/90 p-6 shadow-sm sm:p-8">
      <h2 className="font-serif text-2xl font-semibold text-amber-950">{title}</h2>
      <p className="mt-2 text-sm text-stone-600">{t.formHelp}</p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
        {formError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</p>
        ) : null}

        <Field
          id="full_name"
          label={t.fullName}
          requiredLabel={t.required}
          value={values.full_name}
          error={errors.full_name}
          onChange={(value) => setValues((prev) => ({ ...prev, full_name: value }))}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="email"
            type="email"
            label={t.email}
            requiredLabel={t.required}
            value={values.email}
            error={errors.email}
            onChange={(value) => setValues((prev) => ({ ...prev, email: value }))}
          />
          <Field
            id="phone"
            label={t.phone}
            requiredLabel={t.required}
            value={values.phone}
            error={errors.phone}
            onChange={(value) => setValues((prev) => ({ ...prev, phone: value }))}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="position"
            label={t.position}
            requiredLabel={t.required}
            value={values.position}
            error={errors.position}
            onChange={(value) => setValues((prev) => ({ ...prev, position: value }))}
          />
          <Field
            id="experience_years"
            type="number"
            label={t.experienceYears}
            requiredLabel={t.required}
            value={values.experience_years}
            error={errors.experience_years}
            onChange={(value) => setValues((prev) => ({ ...prev, experience_years: value }))}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="linkedin_url"
            label={t.linkedinUrl}
            requiredLabel={t.optional}
            value={values.linkedin_url}
            error={errors.linkedin_url}
            onChange={(value) => setValues((prev) => ({ ...prev, linkedin_url: value }))}
          />
          <Field
            id="cv_url"
            label={t.cvUrl}
            requiredLabel={t.optional}
            value={values.cv_url}
            error={errors.cv_url}
            onChange={(value) => setValues((prev) => ({ ...prev, cv_url: value }))}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 inline-flex w-fit items-center rounded-full bg-amber-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? pendingLabel : submitLabel}
        </button>
      </form>
    </section>
  );
}

interface FieldProps {
  id: keyof CandidateFormValues;
  type?: string;
  label: string;
  requiredLabel: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function Field({ id, type = "text", label, requiredLabel, value, error, onChange }: FieldProps) {
  return (
    <label htmlFor={id} className="grid gap-2">
      <span className="text-sm font-semibold text-stone-800">
        {label}
        <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
          {requiredLabel}
        </span>
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
      />
      {error ? <span className="text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}
