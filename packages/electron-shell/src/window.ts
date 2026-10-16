// window.ts — the app's window: its own pages open as more windows of the app, anything else in the system browser.
// A window a page opens gets the same guard as the first, so no window of the app ever shows a foreign page. See docs/shell.md.

import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type WebContents,
  type WebPreferences,
} from "electron";
import { openExternalSafely } from "./external.ts";

export interface WindowSpec {
  /** The first page. */
  url: string;
  /** Whether a URL is one of the app's own pages. */
  ours: (url: string) => boolean;
  /** Given to every window, the ones a page opens included — a preload among them. */
  webPreferences: WebPreferences;
  /** Linux and Windows draw it on the window; macOS takes the bundle's. */
  icon?: string;
  options?: BrowserWindowConstructorOptions;
}

/** Keep `wc` on the app's pages, and every window it opens too. */
function guard(wc: WebContents, spec: WindowSpec): void {
  const { icon } = spec;
  wc.on("did-create-window", (child) => {
    if (icon) child.setIcon(icon);
    guard(child.webContents, spec);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (spec.ours(url))
      return {
        action: "allow",
        overrideBrowserWindowOptions: { webPreferences: spec.webPreferences },
      };
    openExternalSafely(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!spec.ours(url)) {
      e.preventDefault();
      openExternalSafely(url);
    }
  });
}

export function openAppWindow(spec: WindowSpec): BrowserWindow {
  const win = new BrowserWindow({
    ...spec.options,
    ...(spec.icon ? { icon: spec.icon } : {}),
    webPreferences: spec.webPreferences,
  });
  guard(win.webContents, spec);
  void win.loadURL(spec.url);
  return win;
}
