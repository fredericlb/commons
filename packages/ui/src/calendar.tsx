import * as React from "react";
import { Button } from "./button";
import { ChevronLeft, ChevronRight } from "./icons";
import { cn } from "./lib/utils";

// Compact month calendar for picking a day. Days in `markedDays` get a dot; the
// selected day is filled and today outlined in the primary. Month navigation is
// internal by default (view follows `selected`), or controlled via `month`/`onMonthChange`.
// `disableFuture` stops both navigation and picking past today, for a log of what happened.
//
// Day keys are "YYYY-M-D" (month 0-indexed, no padding) — use `dayKey(date)`.

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Build the "YYYY-M-D" key a Calendar uses from a Date. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const parseDayKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m, d);
};
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const parseMonthKey = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1);
};

interface CalendarProps {
  /** Selected day as "YYYY-M-D", or "" for none. */
  selected: string;
  onSelect: (key: string) => void;
  /** Days to mark with a dot ("YYYY-M-D"). */
  markedDays?: Set<string>;
  /** Controlled display month "YYYY-MM". Omit for internal navigation. */
  month?: string;
  onMonthChange?: (month: string) => void;
  /** No month after this one and no day after today: for a calendar of things already done. */
  disableFuture?: boolean;
  className?: string;
}

export function Calendar({
  selected,
  onSelect,
  markedDays,
  month,
  onMonthChange,
  disableFuture = false,
  className,
}: CalendarProps) {
  const controlled = month != null;
  const [internal, setInternal] = React.useState(() => {
    const base = selected ? parseDayKey(selected) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  React.useEffect(() => {
    if (!controlled && selected) {
      const d = parseDayKey(selected);
      setInternal(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [selected, controlled]);

  const view = controlled ? parseMonthKey(month!) : internal;
  const year = view.getFullYear();
  const mon = view.getMonth();
  const now = new Date();
  const todayKey = dayKey(now);
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const atCurrentMonth =
    year > now.getFullYear() ||
    (year === now.getFullYear() && mon >= now.getMonth());

  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  // Leading blanks so the 1st lands under its weekday (Monday-start).
  const firstDow = (new Date(year, mon, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const changeMonth = (delta: number) => {
    const next = new Date(year, mon + delta, 1);
    if (controlled) onMonthChange?.(monthKey(next));
    else setInternal(next);
  };

  return (
    <div
      className={cn(
        "w-[244px] flex-none rounded-xl border border-border bg-card p-3",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          data-slot="calendar-nav"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-[13.5px] font-semibold">
          {MONTHS[mon]} {year}
        </span>
        <Button
          variant="outline"
          size="sm"
          data-slot="calendar-nav"
          disabled={disableFuture && atCurrentMonth}
          onClick={() => changeMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className="pb-1 text-center text-[10px] text-muted-foreground"
          >
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d == null)
            return <span key={`e${i}`} className="aspect-square" />;
          const key = `${year}-${mon}-${d}`;
          const isSel = key === selected;
          const isToday = key === todayKey;
          const isFuture =
            disableFuture && new Date(year, mon, d) >= endOfToday;
          return (
            <button
              type="button"
              key={key}
              data-slot="calendar-day"
              disabled={isFuture}
              onClick={() => onSelect(key)}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md border border-transparent text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-30",
                !isSel && !isFuture && "hover:bg-secondary",
                isToday && "border-primary",
                isToday && !isSel && "font-bold text-primary",
                isSel && "bg-primary font-bold text-primary-foreground",
              )}
            >
              {d}
              {markedDays?.has(key) && (
                <span
                  className={cn(
                    "absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full",
                    isSel ? "bg-primary-foreground" : "bg-primary",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
