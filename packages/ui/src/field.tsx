// A labelled form row: the caption above the control, then an optional hint and error under it.
// With `htmlFor` the caption is a <Label> pointing at the control's id; without, the whole row is a
// <label>, which ties the caption to the control it wraps. `FieldHint` and `FieldError` also stand
// alone, for a form-wide message or a rule list under a field.

import type { ReactNode } from "react";
import { CheckIcon } from "./icons";
import { Label } from "./label";
import { cn } from "./lib/utils";

interface FieldProps {
  label: ReactNode;
  /** The control's id. Omit it and the row becomes a <label> around the control. */
  htmlFor?: string;
  /** A muted line under the control — or several `FieldHint`s. */
  hint?: ReactNode;
  /** Shown in red under the control; nothing when empty. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const rest = (
    <>
      {children}
      {typeof hint === "string" ? <FieldHint>{hint}</FieldHint> : hint}
      {error ? <FieldError className="text-xs">{error}</FieldError> : null}
    </>
  );
  if (htmlFor)
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Label htmlFor={htmlFor}>{label}</Label>
        {rest}
      </div>
    );
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] leading-none text-muted-foreground">
        {label}
      </span>
      {rest}
    </label>
  );
}

/** A line under a field. With `ok`, a rule: muted until it is met, then green with a check. */
export function FieldHint({
  ok,
  className,
  children,
}: {
  ok?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-xs",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        className,
      )}
    >
      {ok ? <CheckIcon className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </p>
  );
}

/** An error message, under a field or under a whole form. */
export function FieldError({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p role="alert" className={cn("text-sm text-destructive", className)}>
      {children}
    </p>
  );
}
