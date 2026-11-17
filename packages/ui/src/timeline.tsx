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
  /** With `onClick`: focusable, announced as a button, and Enter or Space clicks it. */
  activatable?: boolean;
}

// Enter or Space on the item itself, never on a control nested inside it, becomes a click.
const activate = (e: React.KeyboardEvent<HTMLLIElement>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  e.currentTarget.click();
};

const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  ({ className, children, time, validated, activatable, ...props }, ref) => {
    const variant = React.useContext(TimelineCtx);
    const keyboard =
      activatable && props.onClick
        ? {
            role: "button",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
              props.onKeyDown?.(e);
              if (!e.defaultPrevented) activate(e);
            },
          }
        : {};

    if (variant === "spine") {
      return (
        <li
          ref={ref}
          className={cn(
            "grid grid-cols-[50px_16px_1fr]",
            props.onClick && "cursor-pointer",
            activatable && "rounded-lg outline-none",
            className,
          )}
          {...props}
          {...keyboard}
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
          <div className="my-1 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors [li:hover_&]:border-primary [li:focus-visible_&]:border-primary [li:focus-visible_&]:ring-2 [li:focus-visible_&]:ring-ring">
            {children}
          </div>
        </li>
      );
    }

    return (
      <li
        ref={ref}
        className={cn(
          "relative border-l border-border py-1 pl-4",
          activatable && "focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
        {...props}
        {...keyboard}
      >
        <span className="absolute -left-[5px] top-2.5 h-2 w-2 rounded-full bg-primary" />
        <div className="flex items-center gap-2">{children}</div>
      </li>
    );
  },
);
TimelineItem.displayName = "TimelineItem";

export { Timeline, TimelineItem };
