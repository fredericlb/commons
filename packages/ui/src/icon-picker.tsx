// Pick an icon by name from the whole set, searched, "none" first. Also resolves a stored name back
// to its component (`useIcons`, `iconsNow`) for the screens that draw what was picked.
// The set is loaded with a dynamic import: that defers its EXECUTION to the first picker, but in an
// app that imports icons statically elsewhere the bundle still holds all of them. docs/icon-picker.md.

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "./input";
import { cn } from "./lib/utils";

export type IconComponent = ComponentType<{ className?: string }>;
export type IconSet = Record<string, IconComponent>;

let cache: IconSet | null = null;
let pending: Promise<IconSet> | null = null;

/** The whole set, loaded once; repeat calls share the cache or the import already in flight. */
export function loadIcons(): Promise<IconSet> {
  if (cache) return Promise.resolve(cache);
  pending ??= import("./icons").then((mod) => {
    const out: IconSet = {};
    // Components only, under their bare name: no helpers, no `icons` map, no `…Icon`/`Lucide…` aliases.
    for (const [name, v] of Object.entries(mod as Record<string, unknown>))
      if (
        /^[A-Z]/.test(name) &&
        !name.endsWith("Icon") &&
        !name.startsWith("Lucide") &&
        (typeof v === "function" || (v && typeof v === "object"))
      )
        out[name] = v as IconComponent;
    cache = out;
    return out;
  });
  return pending;
}

/** What is loaded right now — null until it is. */
export const iconsNow = (): IconSet | null => cache;

/** The icon set, or null while it loads — a screen drawn before it lands draws no icons, then them. */
export function useIcons(): IconSet | null {
  const [icons, setIcons] = useState<IconSet | null>(iconsNow);
  useEffect(() => {
    if (icons) return;
    let live = true;
    void loadIcons().then((s) => {
      if (live) setIcons(s);
    });
    return () => {
      live = false;
    };
  }, [icons]);
  return icons;
}

// Two hundred is more than anyone scans, and rendering the whole set would pause every keystroke.
const MAX_SHOWN = 200;

export function IconPicker({
  value,
  onPick,
  placeholder = "Search icons…",
  noneLabel = "No icon",
  emptyLabel = "No icon by that name",
  className,
}: {
  value?: string;
  onPick: (name: string | undefined) => void;
  placeholder?: string;
  noneLabel?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const set = useIcons();
  const icons = useMemo(() => Object.entries(set ?? {}), [set]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      (needle
        ? icons.filter(([n]) => n.toLowerCase().includes(needle))
        : icons
      ).slice(0, MAX_SHOWN),
    [icons, needle],
  );
  const cell = "flex h-7 w-7 items-center justify-center rounded";

  return (
    <div className={cn("w-72", className)}>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="mb-2 h-8 text-sm"
      />
      <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
        {/* "none" first, so taking an icon back is as easy as choosing one. */}
        <button
          type="button"
          title={noneLabel}
          aria-label={noneLabel}
          aria-pressed={!value}
          onClick={() => onPick(undefined)}
          className={cn(
            cell,
            "text-muted-foreground",
            value ? "hover:bg-accent" : "bg-secondary",
          )}
        >
          —
        </button>
        {shown.map(([name, Icon]) => (
          <button
            type="button"
            key={name}
            title={name}
            aria-label={name}
            aria-pressed={name === value}
            onClick={() => onPick(name)}
            className={cn(
              cell,
              name === value
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      {set && shown.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : null}
    </div>
  );
}
