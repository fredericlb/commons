// permissions.ts — a session's permission handlers, request and check alike, both answering policy.ts's permissionAllowed.
// Without them Electron grants every permission to every frame, a foreign one included. See docs/shell.md.

import type { Session, WebContents } from "electron";
import { openExternalSafely } from "./external.ts";
import { line } from "./log.ts";
import {
  DEFAULT_GRANTS,
  type PermissionPolicy,
  type PermissionScope,
  permissionAllowed,
} from "./policy.ts";

export interface PermissionOptions {
  /** The app's own origins. */
  origins: readonly string[];
  /** Added to DEFAULT_GRANTS, or overriding one of them. */
  grants?: Readonly<Record<string, PermissionScope>>;
}

const topOf = (wc: WebContents | null): string | undefined =>
  wc && !wc.isDestroyed() ? wc.getURL() : undefined;

/** Install the handlers on `ses`; returns the policy they answer. */
export function installPermissions(
  ses: Session,
  opts: PermissionOptions,
): PermissionPolicy {
  const policy: PermissionPolicy = {
    origins: opts.origins,
    grants: { ...DEFAULT_GRANTS, ...opts.grants },
  };
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const requesting =
      ("securityOrigin" in details ? details.securityOrigin : undefined) ??
      details.requestingUrl;
    const ask = {
      permission,
      requesting,
      top: topOf(wc),
      mainFrame: details.isMainFrame,
    };
    // An external protocol is never handed to Chromium's launcher: the app's own frames go through openExternalSafely.
    if (permission === "openExternal") {
      const target = "externalURL" in details ? details.externalURL : undefined;
      if (
        target &&
        permissionAllowed({ ...policy, grants: { openExternal: "app" } }, ask)
      )
        openExternalSafely(target);
      callback(false);
      return;
    }
    const granted = permissionAllowed(policy, ask);
    if (!granted) line("shell", `refused ${permission} to ${requesting}`);
    callback(granted);
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) =>
    permissionAllowed(policy, {
      permission,
      requesting: details.securityOrigin ?? requestingOrigin,
      top: details.embeddingOrigin ?? topOf(wc) ?? requestingOrigin,
      mainFrame: details.isMainFrame,
    }),
  );
  return policy;
}
