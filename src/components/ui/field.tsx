import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../../lib/cn";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function Field({ className, error, hint, id, label, ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = `${inputId}-label`;
  const messageId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId} id={labelId}>{label}</label>
      <input aria-describedby={messageId} aria-invalid={Boolean(error)} aria-labelledby={labelId} className={cn("field__input", className)} id={inputId} {...props} />
      {error ? <span className="field__error" id={messageId}>{error}</span> : hint ? <span className="field__hint" id={messageId}>{hint}</span> : null}
    </div>
  );
}
