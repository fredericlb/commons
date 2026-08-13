import { Menu } from "lucide-react";
import type * as React from "react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onClick}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { HamburgerMenu };
