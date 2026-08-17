import * as React from "react";
import { Button } from "./button";
import { HamburgerMenu, type HamburgerMenuItem } from "./hamburger-menu";
import { cn } from "./lib/utils";

// The app bar every frediverse SPA shares: the app title on the left, its
// top-level entries on the right — inline buttons from `sm` up, collapsed into
// a hamburger menu below. Two looks: `accent` (primary background, white text)
// and `plain` (card background, a rule underneath) for the apps whose page is
// the accent. See docs/app-header.md.

export type AppHeaderItem = HamburgerMenuItem;

export interface AppHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** App name, left side. A link is fine — it renders as given. */
  title: React.ReactNode;
  /** Optional status line next to the title (e.g. a count, a build stamp). */
  subtitle?: React.ReactNode;
  /** Top-level entries — buttons on desktop, menu items behind the hamburger on mobile. */
  items?: AppHeaderItem[];
  /**
   * Controls that stay inline on every screen size, after the entries — a
   * lock button, a locale switcher, a "new" dialog trigger. Not for pages:
   * those are `items`, and belong behind the hamburger on a phone.
   */
  actions?: React.ReactNode;
  variant?: "accent" | "plain";
  /**
   * Cap and centre the bar's content (`max-w-3xl mx-auto`), for an app whose
   * page is a centred column and wants the bar to line up with it.
   */
  contained?: boolean;
}

const VARIANT = {
  accent: {
    bar: "bg-primary text-primary-foreground",
    button:
      "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground",
    activeButton: "bg-primary-foreground/20",
    subtitle: "text-primary-foreground/75",
  },
  plain: {
    bar: "border-b border-border bg-card text-foreground",
    button: "",
    activeButton: "",
    subtitle: "text-muted-foreground",
  },
} as const;

const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(
  (
    {
      title,
      subtitle,
      items = [],
      actions,
      variant = "accent",
      contained = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const look = VARIANT[variant];
    return (
      <header
        ref={ref}
        className={cn("sticky top-0 z-10", look.bar, className)}
        {...props}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-5 py-3",
            contained && "mx-auto max-w-3xl",
          )}
        >
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="truncate font-serif text-lg">{title}</span>
            {subtitle ? (
              <span
                className={cn(
                  "hidden truncate text-xs min-[420px]:inline",
                  look.subtitle,
                )}
              >
                {subtitle}
              </span>
            ) : null}
          </div>

          {children}

          <div className="flex items-center gap-1">
            {items.length > 0 ? (
              <>
                {/* Desktop: inline entries. */}
                <nav className="hidden items-center gap-1 sm:flex">
                  {items.map((item) => (
                    <Button
                      key={item.label}
                      variant={
                        item.active && variant === "plain"
                          ? "secondary"
                          : "ghost"
                      }
                      size="sm"
                      onClick={item.onClick}
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        look.button,
                        item.active && look.activeButton,
                        item.danger && "text-destructive",
                      )}
                    >
                      {item.icon}
                      {item.label}
                      {item.trailing}
                    </Button>
                  ))}
                </nav>

                {/* Mobile: hamburger menu. */}
                <HamburgerMenu
                  items={items}
                  className={cn(look.button, "sm:hidden")}
                />
              </>
            ) : null}
            {actions}
          </div>
        </div>
      </header>
    );
  },
);
AppHeader.displayName = "AppHeader";

export { AppHeader };
