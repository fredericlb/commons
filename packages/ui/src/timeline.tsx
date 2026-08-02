import * as React from "react";
import { cn } from "./lib/utils";

// Two looks, selected on <Timeline variant>:
//  · "simple" — a left spine with a dot; compose date/body/actions inline.
//  · "spine"  — radiok7's richer layout: a left label column (e.g. a time), a
//               centered spine + dot, and a bordered card for the content.
// Feed items newest-first — they render top-to-bottom in the order given.
type TimelineVariant = "simple" | "spine";

const TimelineCtx = React.createContext<TimelineVariant>("simple");

const Timeline = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement> & { variant?: TimelineVariant }
>(({ className, variant = "simple", ...props }, ref) => (
  <TimelineCtx.Provider value={variant}>
    <ul
      ref={ref}
      className={cn(
        variant === "simple" ? "ml-1 space-y-1" : "m-0 list-none p-0",
        className,
      )}
      {...props}
    />
  </TimelineCtx.Provider>
));
Timeline.displayName = "Timeline";

interface TimelineItemProps extends React.HTMLAttributes<HTMLLIElement> {
  /** "spine" variant: the left-column label (e.g. a time or date). */
  time?: React.ReactNode;
  /** "spine" variant: render the dot in the "validated" (green) colour. */
  validated?: boolean;
}

const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, children, time, validated, ...props }, ref) => {
    const variant = React.useContext(TimelineCtx);

    if (variant === "spine") {
      return (
        <li
          ref={ref}
          className={cn(
            "grid grid-cols-[50px_16px_1fr]",
            props.onClick && "cursor-pointer",
            className,
          )}
          {...props}
        >
          <div className="pr-2 pt-3 text-right text-xs tabular-nums text-muted-foreground">
            {time}
          </div>
          <div className="relative flex justify-center">
            <span className="absolute inset-y-0 w-0.5 bg-border" />
            <span
              className={cn(
                "relative z-[1] mt-[9px] size-2.5 rounded-full shadow-[0_0_0_3px_var(--sh-background)]",
                validated ? "bg-green" : "bg-primary",
              )}
            />
          </div>
          <div className="my-1 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors [li:hover_&]:border-primary">
            {children}
          </div>
        </li>
      );
    }

    return (
      <li
        ref={ref}
        className={cn("relative border-l border-border py-1 pl-4", className)}
        {...props}
      >
        <span className="absolute -left-[5px] top-2.5 h-2 w-2 rounded-full bg-primary" />
        <div className="flex items-center gap-2">{children}</div>
      </li>
    );
  },
);
TimelineItem.displayName = "TimelineItem";

export { Timeline, TimelineItem };
