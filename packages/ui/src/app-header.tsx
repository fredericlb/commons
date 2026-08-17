import * as React from "react";
import { Button } from "./button";
import { HamburgerMenu, type HamburgerMenuItem } from "./hamburger-menu";
import { cn } from "./lib/utils";

// The app bar every frediverse SPA shares: the app NAME on the left in the
// brand face (Nabla), its top-level entries on the right — inline buttons from
// `sm` up, collapsed into a hamburger menu below. The house look is `tint`:
// the accent at 20 % over the page. `accent` (solid primary) and `plain` (card)
// remain for an app that has a reason. See docs/app-header.md.

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
  /** `tint` (the default) is the house look; the other two are opt-in. */
  variant?: "tint" | "accent" | "plain";
  /**
   * Cap and centre the bar's content (`max-w-3xl mx-auto`), for an app whose
   * page is a centred column and wants the bar to line up with it.
   */
  contained?: boolean;
}

const VARIANT = {
  tint: {
    // A tint, not a fill: the page shows through, and the bar reads as part
    // of it rather than a lid on top.
    bar: "border-b border-primary/20 bg-primary/20 text-foreground",
    button: "",
    activeButton: "",
    subtitle: "text-muted-foreground",
  },
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
      variant = "tint",
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
            {/* The name in the brand face. Nabla is a colour font and paints
                itself; the size is generous because it is built for it. */}
            <span className="truncate font-brand text-xl leading-none">
              {title}
            </span>
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
                        item.active && variant !== "accent"
                          ? "secondary"
                          : "ghost"
                      }
                      size="sm"
                      onClick={item.onClick}
                      disabled={item.disabled}
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
