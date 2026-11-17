// user-menu.tsx — the top-right menu of an app: who is signed in, the app's settings, links to
// the host's other apps (each in a NEW tab), and the logout. It fetches nothing and ends no session itself: the
// email and the logout are the host's, since only the host knows where its /auth answers and
// where to land afterwards. See ../docs/user-menu.md.

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { CircleUser, LogOut, type LucideIcon, Settings } from "./icons";

export interface UserMenuLink {
  /** A stable key for the row. */
  id: string;
  label: string;
  /** One line under the label. */
  hint?: string;
  icon?: LucideIcon;
  href: string;
}

/** A row of the host's own, drawn with Settings: a page of this app the person reaches from the menu. */
export interface UserMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
}

export interface UserMenuProps {
  /** Who is signed in, as the menu's heading; null while it is not known yet. */
  email?: string | null;
  /** Ends the session — the host's call, as is where to land afterwards. */
  onLogout: () => void;
  /** Opens this app's settings, as the row right under the email; no row without it. */
  onSettings?: () => void;
  /** More of this app's pages, as rows under Settings, in the same group. */
  items?: UserMenuItem[];
  /** Other applications, each opened in a new tab. */
  links?: UserMenuLink[];
  /** Said in place of the links when there is nowhere to go. */
  notice?: string;
  /** The trigger's accessible name. */
  label?: string;
  settingsLabel?: string;
  logoutLabel?: string;
}

export function UserMenu({
  email,
  onLogout,
  onSettings,
  items,
  links = [],
  notice,
  label = "Account",
  settingsLabel = "Settings",
  logoutLabel = "Sign out",
}: UserMenuProps) {
  const hasMiddle = notice !== undefined || links.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          title={email || label}
        >
          <CircleUser className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email || "…"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onSettings || items?.length ? (
          <>
            {onSettings ? (
              <DropdownMenuItem className="gap-2" onSelect={onSettings}>
                <Settings className="h-4 w-4" />
                {settingsLabel}
              </DropdownMenuItem>
            ) : null}
            {items?.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  className="gap-2"
                  onSelect={item.onSelect}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  {item.label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        ) : null}
        {notice !== undefined ? (
          <DropdownMenuItem disabled className="text-xs">
            {notice}
          </DropdownMenuItem>
        ) : (
          links.map((link) => {
            const Icon = link.icon;
            return (
              // asChild so the row IS the anchor, and ctrl-click and middle-click mean what they say.
              <DropdownMenuItem
                key={link.id}
                asChild
                className="items-start gap-2"
              >
                {/* Another APPLICATION: leaving this one would lose what it holds. */}
                <a href={link.href} target="_blank" rel="noopener">
                  {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block">{link.label}</span>
                    {link.hint ? (
                      <span className="block text-xs text-muted-foreground">
                        {link.hint}
                      </span>
                    ) : null}
                  </span>
                </a>
              </DropdownMenuItem>
            );
          })
        )}
        {hasMiddle ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem className="gap-2" onSelect={onLogout}>
          <LogOut className="h-4 w-4" />
          {logoutLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
