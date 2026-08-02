import * as React from "react";
import { cn } from "./lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      // flex-1/min-w-0 so inputs share .row flex lines like the legacy CSS did
      "flex h-9 w-full flex-1 min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      "file:me-2 file:h-full file:cursor-pointer file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:text-xs file:font-semibold file:text-foreground",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
