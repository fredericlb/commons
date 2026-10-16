// session.ts — the signed session cookie, and what makes one still VALID: its own expiry, the age of
// its groups, and the subject's "not before" epoch. A signature alone proves nothing about time:
// cookie-session signs no expiry, so a copied cookie would otherwise live as long as the secret.
// See docs/session.md.

import cookieSession from "cookie-session";
import type { RequestHandler } from "express";
import Keygrip from "keygrip";
import { readJsonFile, writeJsonFile } from "./jsonFile.ts";

/** The principal in the session cookie; the index signature carries an app's own fields (`mapUser`). */
export interface SessionUser {
  sub?: string;
  name?: string;
  email?: string | null;
  groups?: string[];
  [key: string]: unknown;
}

/** How long a session lives from its sign-in, whatever it carries. */
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a session that carries groups lives: the bound on how stale a group removal can be. */
export const GROUPS_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Clock skew tolerated on a session's `iat`. */
const SKEW_MS = 60_000;

/** Per-subject "not before" epochs: a session issued before its subject's epoch is dead. */
export interface SessionRevocations {
  /** The epoch (ms) before which `sub`'s sessions are refused, if any. Called on every request. */
  notBefore(sub: string): number | undefined;
  /** Refuse every session of `sub` issued before `at` (default now). */
  revoke(sub: string, at?: number): void;
}

/** In memory, and persisted to `file` when one is given. */
export function createSessionRevocations(
  opts: { file?: string } = {},
): SessionRevocations {
  let epochs: Record<string, number> | null = null;
  const load = (): Record<string, number> => {
    epochs ??= opts.file ? readJsonFile(opts.file, {}) : {};
    return epochs;
  };
  return {
    notBefore: (sub) => {
      const at = load()[sub];
      return typeof at === "number" ? at : undefined;
    },
    revoke: (sub, at = Date.now()) => {
      const all = load();
      all[sub] = Math.max(all[sub] ?? 0, at);
      if (opts.file) writeJsonFile(opts.file, all);
    },
  };
}

/** What decides whether a signed session is still good. */
export interface SessionPolicy {
  revocations?: SessionRevocations;
  /** Default GROUPS_MAX_AGE_MS. */
  groupsMaxAgeMs?: number;
}

/** The session's user when its stamps are all good, else null. An unstamped session is refused. */
export function validSessionUser(
  session: Record<string, unknown> | null | undefined,
  policy: SessionPolicy = {},
  now = Date.now(),
): SessionUser | null {
  const user = session?.user;
  if (!session || !user || typeof user !== "object") return null;
  const { iat, exp } = session;
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (now >= exp || iat > now + SKEW_MS) return null;
  const u = user as SessionUser;
  const groupsMaxAge = policy.groupsMaxAgeMs ?? GROUPS_MAX_AGE_MS;
  if (
    Array.isArray(u.groups) &&
    u.groups.length > 0 &&
    now >= iat + groupsMaxAge
  )
    return null;
  if (typeof u.sub === "string") {
    const notBefore = policy.revocations?.notBefore(u.sub);
    if (notBefore !== undefined && iat < notBefore) return null;
  }
  return u;
}

/** The stamps a new session carries; `from` keeps an existing session's, so a handoff extends nothing. */
export function stampSession(
  session: Record<string, unknown>,
  user: SessionUser,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
  from?: { iat: number; exp: number },
): void {
  const now = Date.now();
  session.user = user;
  session.iat = from?.iat ?? now;
  session.exp = from?.exp ?? now + maxAgeMs;
}

/** Forget the user on a session whose stamps failed, keeping anything else (an in-flight login). */
export function clearSessionUser(session: Record<string, unknown>): void {
  delete session.user;
  delete session.iat;
  delete session.exp;
}

/** The cookie-session middleware setupAuth installs, exported so a test's own app gets the same cookie. */
export function sessionMiddleware(opts: {
  cookieName: string;
  secret: string;
  /** `Domain=` — omitted keeps the cookie host-only. */
  domain?: string;
  /** The cookie's lifetime; default SESSION_MAX_AGE_MS. */
  maxAgeMs?: number;
}): RequestHandler {
  return cookieSession({
    name: opts.cookieName,
    keys: [opts.secret],
    httpOnly: true,
    domain: opts.domain,
    // A shared domain means cross-site fetches, which only a SameSite=None cookie rides on (docs/session.md).
    sameSite: opts.domain ? "none" : "lax",
    // Undefined lets the cookies lib decide per request; None without Secure is a cookie the browser drops.
    secure: opts.domain ? true : undefined,
    maxAge: opts.maxAgeMs ?? SESSION_MAX_AGE_MS,
  });
}

// Minimal Cookie-header parser: enough for the two names we look up.
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (!k || k in out) continue;
    const v = part.slice(eq + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** The Cookie header cookie-session would issue for `user`, stamps included — for callers with no response. */
export function sessionCookieHeader(
  user: SessionUser,
  opts: { cookieName: string; secret: string; maxAgeMs?: number; iat?: number },
): string {
  const iat = opts.iat ?? Date.now();
  const payload: Record<string, unknown> = {
    user,
    iat,
    exp: iat + (opts.maxAgeMs ?? SESSION_MAX_AGE_MS),
  };
  if (opts.maxAgeMs !== undefined) payload._expire = Date.now() + opts.maxAgeMs;
  const value = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = new Keygrip([opts.secret]).sign(`${opts.cookieName}=${value}`);
  return `${opts.cookieName}=${value}; ${opts.cookieName}.sig=${sig}`;
}

/** The valid session user in a raw Cookie header (a WebSocket upgrade), checked as requireAuth checks it. */
export function sessionFromCookieHeader(
  header: string | undefined,
  opts: { cookieName: string; secret: string } & SessionPolicy,
): SessionUser | null {
  const cookies = parseCookieHeader(header);
  const raw = cookies[opts.cookieName];
  const sig = cookies[`${opts.cookieName}.sig`];
  if (!raw || !sig) return null;
  // cookie-session signs `<name>=<value>`, so verify that string rather than the value alone.
  if (!new Keygrip([opts.secret]).verify(`${opts.cookieName}=${raw}`, sig)) {
    return null;
  }
  let session: Record<string, unknown>;
  try {
    session = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const expire = session._expire;
  if (typeof expire === "number" && Date.now() > expire) return null;
  return validSessionUser(session, opts);
}
