// The holding screen while something above decides what to render: a spinner, never a screen that
// belongs to something else. Two shapes — on its own it is the whole page; `inset`, inside an app
// shell, it fills what is left under the bar. The label is for screen readers, in the app's language.

import { Loader2Icon } from "./icons";
import { cn } from "./lib/utils";

export function Splash({
  label,
  inset = false,
  className,
}: {
  /** What a screen reader announces, e.g. "Loading". */
  label: string;
  inset?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "flex items-center justify-center text-muted-foreground",
        inset ? "min-h-0 flex-1" : "min-h-screen",
        className,
      )}
    >
      <Loader2Icon className="size-6 animate-spin" aria-hidden />
    </div>
  );
}
