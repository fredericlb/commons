// policy.ts — the two decisions a desktop app makes for its pages: which URL may reach the OS, and which permission a frame gets.
// Pure and free of `electron`, so a test runs it under plain node. Everything not listed is refused. See docs/shell.md.

/** The schemes handed to the OS; every other one names a handler a page must not reach (`file:`, `smb:`, `ms-msdt:`…). */
export const EXTERNAL_SCHEMES: readonly string[] = [
  "http:",
  "https:",
  "mailto:",
];

/** The URL to give the OS for `raw`, normalised — or null when it must not leave. */
export function externalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!EXTERNAL_SCHEMES.includes(u.protocol)) return null;
  // Credentials in a link are a phishing shape, and nothing here sends one.
  if (u.username || u.password) return null;
  if (u.protocol !== "mailto:" && !u.hostname) return null;
  return u.href;
}

/** Who may get a permission: the app's top frame only, or any app frame inside an app page. */
export type PermissionScope = "top" | "app";

export interface PermissionPolicy {
  /** The app's own origins, e.g. `http://127.0.0.1:18789`. */
  origins: readonly string[];
  /** Permission name → who gets it; a name absent here is refused everywhere. */
  grants: Readonly<Record<string, PermissionScope>>;
}

/** What every app gets unless it says otherwise: a mic or camera and the clipboard for its top frame, fullscreen for its frames. */
export const DEFAULT_GRANTS: Readonly<Record<string, PermissionScope>> = {
  media: "top",
  "clipboard-sanitized-write": "top",
  fullscreen: "app",
};

export interface PermissionAsk {
  permission: string;
  /** The requesting frame's origin or URL. */
  requesting: string | undefined;
  /** The origin or URL of the page at the top of that frame's tree. */
  top: string | undefined;
  mainFrame: boolean;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const o = new URL(url).origin;
    return o === "null" ? null : o;
  } catch {
    return null;
  }
}

/** Whether `ask` is granted under `policy`: a listed permission, asked by an app frame whose top page is the app's too. */
export function permissionAllowed(
  policy: PermissionPolicy,
  ask: PermissionAsk,
): boolean {
  const scope = Object.hasOwn(policy.grants, ask.permission)
    ? policy.grants[ask.permission]
    : undefined;
  if (!scope) return false;
  const ours = (url: string | undefined) => {
    const o = originOf(url);
    return o !== null && policy.origins.some((p) => originOf(p) === o);
  };
  if (!ours(ask.requesting) || !ours(ask.top)) return false;
  return scope === "app" || ask.mainFrame;
}
