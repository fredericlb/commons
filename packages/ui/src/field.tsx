import type { ReactNode } from "react";
import { cn } from "./lib/utils";

interface FieldProps {
  label: string;
  className?: string;
  children: ReactNode;
}

/** A labelled form row: caption above the control (the legacy .field block). */
export function Field({ label, className, children }: FieldProps) {
  return (
    <label className={cn("mb-3.5 block", className)}>
      <span className="mb-1.5 block text-[13px] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
