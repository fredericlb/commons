// external.ts — the one way a desktop app hands a URL to the OS: only the schemes in policy.ts, never a credential in it.
// Every `shell.openExternal` of an app goes through here; a refused URL is logged by scheme and dropped. See docs/shell.md.

import { shell } from "electron";
import { line } from "./log.ts";
import { externalUrl } from "./policy.ts";

/** Open `raw` in the system's handler when policy.ts allows it; false when it was refused. */
export function openExternalSafely(raw: string): boolean {
  const href = externalUrl(raw);
  if (!href) {
    // The scheme only: a refused URL may carry what a page wanted to smuggle out.
    const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(raw)?.[0] ?? "no scheme";
    line("shell", `refused to open an external link (${scheme})`);
    return false;
  }
  shell.openExternal(href).catch((e: unknown) => {
    line("shell", `could not open an external link: ${String(e)}`);
  });
  return true;
}
