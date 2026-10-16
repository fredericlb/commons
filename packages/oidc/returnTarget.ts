// returnTarget.ts — where the browser may be sent after a sign-in: this origin, or one listed as trusted.
// A target is RESOLVED as the browser would resolve it, never matched as text: `/\evil.com` is a path
// to a string test and another host to a browser. See docs/session.md.

import { publicOrigin } from "@frediverse/http/origin";
import type { Request } from "express";

/** Where the browser goes when it asked for nowhere it may go. */
export const APP_ROOT = "/";

// Tab, newline and the other C0 controls are stripped by URL parsers, so they hide a second slash.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A path on this origin or an absolute URL on a trusted one; anything else reduces to APP_ROOT. */
export function safeReturnTarget(
  target: string,
  req: Request,
  trustedOrigins?: string[],
): string {
  if (!target || CONTROL.test(target)) return APP_ROOT;
  // `//host` and `/\host` are another host to the browser, whatever they look like here.
  if (/^[/\\][/\\]/.test(target)) return APP_ROOT;
  const own = publicOrigin(req);
  let url: URL;
  try {
    url = new URL(target, own);
  } catch {
    return APP_ROOT;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return APP_ROOT;
  if (url.origin === own) {
    // A path that resolved to `//…` (`/.//evil.com`) would leave the origin once sent as Location.
    if (url.pathname.startsWith("//")) return APP_ROOT;
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return trustedOrigins?.includes(url.origin) ? url.toString() : APP_ROOT;
}

/** Whether a state-changing request came from this origin (or a trusted one), as the browser says. */
export function isSameOriginRequest(
  req: Request,
  trustedOrigins?: string[],
): boolean {
  const origin = req.get("origin");
  if (origin !== undefined)
    return (
      origin === publicOrigin(req) ||
      (trustedOrigins?.includes(origin) ?? false)
    );
  // No Origin: a browser still says where the request came from; a non-browser client cannot be forged into one.
  const site = req.get("sec-fetch-site");
  return site === undefined || site === "same-origin" || site === "none";
}
