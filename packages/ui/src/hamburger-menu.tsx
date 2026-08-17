import { Check, Menu } from "lucide-react";
import * as React from "react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "./lib/utils";

// A hamburger button opening a dropdown of navigation entries — the mobile
// collapse of an app's top-level actions. AppHeader composes it; it can also
// be used on its own wherever a compact menu is needed.

export interface HamburgerMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  /** The entry the app is currently on — ticked in the menu, pressed inline. */
  active?: boolean;
  /** Draw a rule above this entry: keeps "log out" apart from the pages. */
  separatorBefore?: boolean;
  /** Styled as destructive (log out, delete). */
  danger?: boolean;
}

export interface HamburgerMenuProps {
  items: HamburgerMenuItem[];
  /** Extra classes for the trigger button (e.g. colors, `sm:hidden`). */
  className?: string;
  /** Accessible name of the trigger. */
  label?: string;
}

function HamburgerMenu({
  items,
  className,
  label = "Menu",
}: HamburgerMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(className)}
        >
          <Menu className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((item) => (
          <React.Fragment key={item.label}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onClick={item.onClick}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                item.active && "font-medium",
                item.danger && "text-destructive focus:text-destructive",
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.active ? <Check className="size-4 opacity-70" /> : null}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { HamburgerMenu };
