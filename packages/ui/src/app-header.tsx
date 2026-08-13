import * as React from "react";
import { Button } from "./button";
import { HamburgerMenu, type HamburgerMenuItem } from "./hamburger-menu";
import { cn } from "./lib/utils";

// The app bar every frediverse SPA shares: accent (primary) background, white
// text, the app title on the left and its top-level entries on the right —
// inline buttons from `sm` up, collapsed into a hamburger menu below.

export type AppHeaderItem = HamburgerMenuItem;

export interface AppHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** App name, left side. */
  title: React.ReactNode;
  /** Optional status line next to the title (e.g. a count). */
  subtitle?: React.ReactNode;
  /** Top-level entries — buttons on desktop, menu items behind the hamburger on mobile. */
  items?: AppHeaderItem[];
}

const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(
  ({ title, subtitle, items = [], className, children, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between gap-3 bg-primary px-5 py-3 text-primary-foreground",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="truncate font-serif text-lg">{title}</span>
        {subtitle ? (
          <span className="hidden truncate text-xs text-primary-foreground/75 min-[420px]:inline">
            {subtitle}
          </span>
        ) : null}
      </div>

      {children}

      {items.length > 0 ? (
        <>
          {/* Desktop: inline entries. */}
          <nav className="hidden items-center gap-1 sm:flex">
            {items.map((item) => (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                onClick={item.onClick}
                className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              >
                {item.icon}
                {item.label}
              </Button>
            ))}
          </nav>

          {/* Mobile: hamburger menu. */}
          <HamburgerMenu
            items={items}
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground sm:hidden"
          />
        </>
      ) : null}
    </header>
  ),
);
AppHeader.displayName = "AppHeader";

export { AppHeader };
