// Shared OIDC (OpenID Connect) authentication for the frediverse apps.
//
// Uses the Authorization Code flow with PKCE via `openid-client`. The backend
// is a confidential client: it performs the token exchange and stores the user
// in a signed session cookie. The SPA never handles tokens directly.
//
// The session is *stateless*: the (small) user object is serialized into the
// signed cookie itself via `cookie-session`, not held in server memory. This is
// deliberate — an in-memory store is wiped on every backend restart (e.g. the
// `node --watch` dev server), which logs the user out on the next page reload.
// Keeping the session in the cookie makes it survive restarts.
//
// Configure via environment variables (per consuming app):
//   OIDC_ISSUER          e.g. https://accounts.google.com  or  Keycloak realm URL
//   OIDC_CLIENT_ID
//   OIDC_CLIENT_SECRET
//   SESSION_SECRET       cookie signing secret
//
// Nothing here configures our *own* host. The SPA and this backend share one
// origin, so anything host-shaped is derived from the incoming request instead:
// the redirect_uri (see redirectUriFor), the post-login target (a relative path
// — "/" unless the SPA passed ?return_to=, see safeReturnTarget), and the
// cookie's Secure flag. See apps/obscura for the same pattern.
//
// If OIDC_ISSUER / OIDC_CLIENT_ID are absent, the server falls back to a DEV
// AUTH stub (a single "Dev User") so the app is runnable locally without an
// identity provider. Auth is still mandatory — you must "log in" as that user.

import { defineEnv, z } from "@frediverse/env";
import { publicOrigin, redirectUriFor } from "@frediverse/http/origin";
import cookieSession from "cookie-session";
import type { Express, Request, RequestHandler, Response } from "express";
import Keygrip from "keygrip";
import { type Client, generators, Issuer } from "openid-client";

// The other way in: HMAC bearer tokens for clients that can't hold a cookie.
export { type ApiTokens, createApiTokens } from "./apiToken.ts";
// Host derivation (publicOrigin, redirectUriFor) lives in the shared
// @frediverse/http/origin module so this stack and obscura's keep ONE copy.
// Re-exported here so existing importers of @frediverse/oidc are unaffected.
export { publicOrigin, redirectUriFor };

/** The built-in routes setupAuth mounts. */
export type AuthRoute = "login" | "callback" | "logout" | "me";

const ALL_ROUTES: AuthRoute[] = ["login", "callback", "logout", "me"];

/**
 * The principal stored in the session cookie. `groups` comes from the IdP
 * (see isAdmin); the index signature lets an app carry its own fields via
 * `mapUser` (obscura tags each session with a `kind`).
 */
export interface SessionUser {
  sub?: string;
  name?: string;
  email?: string | null;
  groups?: string[];
  [key: string]: unknown;
}

export interface AuthOptions {
  /** Name of the session cookie (unique per app, e.g. "songs.sid"). */
  cookieName: string;
  /**
   * The caller's section in the root env.yaml (e.g. "radiok7-backend"), so the
   * OIDC settings below resolve the same way as the rest of its config.
   */
  service: string;
  /** Scopes to request. Default ["openid", "profile", "email"]. */
  scopes?: string[];
  /**
   * Which built-in routes to mount. Default: all. An app that answers one of
   * these itself (obscura's /auth/me carries extra gate flags) omits it here
   * rather than relying on registration order to shadow ours.
   */
  mountRoutes?: AuthRoute[];
  /**
   * Shape the session user from the merged claims/UserInfo profile. Default:
   * { sub, name, email, groups }. Return a superset to carry app-specific
   * fields.
   */
  mapUser?: (profile: Record<string, unknown>) => SessionUser;
}

/**
 * Case-insensitive group membership test — the shared authorization primitive
 * on top of the `groups` claim (obscura's auth.go used strings.EqualFold).
 * Pure: the caller passes its own admin list, since which groups are
 * privileged is per-app config, not per-IdP.
 */
export function isAdmin(
  user: SessionUser | null | undefined,
  adminGroups: readonly string[],
): boolean {
  if (!user) return false;
  const admin = adminGroups.map((g) => g.toLowerCase());
  return (user.groups ?? []).some((g) => admin.includes(g.toLowerCase()));
}

// Where we send the browser once it's logged in, when it didn't ask for
// anywhere in particular. The SPA is served at the root of this same origin, so
// a relative path is enough — and unlike an absolute APP_BASE_URL it can't be
// pointed off-origin.
const APP_ROOT = "/";

// Minimal Cookie-header parser: enough for the two names we look up, and it
// keeps this package free of a cookie-parsing dependency.
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

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * The cookie-session middleware setupAuth installs. Exported so code that
 * builds its own express app (tests, chiefly) gets byte-identical cookie
 * settings instead of a copy that can drift from the real one.
 */
export function sessionMiddleware(opts: {
  cookieName: string;
  secret: string;
}): RequestHandler {
  return cookieSession({
    name: opts.cookieName,
    keys: [opts.secret],
    httpOnly: true,
    // Frontend and backend are same-origin, so Lax cookies are sent on these
    // calls without needing HTTPS.
    sameSite: "lax",
    // `secure` is deliberately omitted, not hardcoded: cookie-session then
    // lets the `cookies` lib decide per request (Secure over https, plain
    // over local http), reading req.protocol — which honours the edge's
    // X-Forwarded-Proto thanks to `trust proxy`. Pinning it to a constant
    // would either drop the flag in prod or make the lib throw ("Cannot send
    // secure cookie over unencrypted connection") in dev.
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/**
 * Build the Cookie header for a session — the inverse of
 * sessionFromCookieHeader, producing exactly what cookie-session would issue.
 *
 * For callers that need a session cookie without an express response: chiefly
 * tests, which would otherwise each hand-roll the encoding and drift from it.
 */
export function sessionCookieHeader(
  user: SessionUser,
  opts: { cookieName: string; secret: string; maxAgeMs?: number },
): string {
  const payload: Record<string, unknown> = { user };
  if (opts.maxAgeMs !== undefined) payload._expire = Date.now() + opts.maxAgeMs;
  const value = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = new Keygrip([opts.secret]).sign(`${opts.cookieName}=${value}`);
  return `${opts.cookieName}=${value}; ${opts.cookieName}.sig=${sig}`;
}

/**
 * Read the session straight from a raw Cookie header, verifying the signature
 * the same way cookie-session does.
 *
 * For code that runs OUTSIDE the express middleware chain and so never gets a
 * populated `req.session` — in practice a WebSocket upgrade, which is a raw
 * http `upgrade` event (see obscura's ws.ts). Returns null when the cookie
 * is absent, tampered with, or expired.
 */
export function sessionFromCookieHeader(
  header: string | undefined,
  opts: { cookieName: string; secret: string },
): SessionUser | null {
  const cookies = parseCookieHeader(header);
  const raw = cookies[opts.cookieName];
  const sig = cookies[`${opts.cookieName}.sig`];
  if (!raw || !sig) return null;
  // cookie-session signs `<name>=<value>` with Keygrip (as the `cookies` lib
  // does), so verify the same string rather than the value alone.
  if (!new Keygrip([opts.secret]).verify(`${opts.cookieName}=${raw}`, sig)) {
    return null;
  }
  let session: Record<string, unknown>;
  try {
    session = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
  // cookie-session stamps its own expiry into the payload; honour it, since
  // nothing else will out here.
  const expire = session._expire;
  if (typeof expire === "number" && Date.now() > expire) return null;
  const user = session.user;
  return user && typeof user === "object" ? (user as SessionUser) : null;
}

// Validate the post-login redirect. Relative paths always pass; an absolute URL
// must be THIS origin; everything else reduces to APP_ROOT, so the login flow
// can't be used as an open redirect. (Same rule as obscura's own
// safeReturnTarget — single origin means same-origin is the whole allowlist.)
export function safeReturnTarget(target: string, req: Request): string {
  if (!target) return APP_ROOT;
  // A protocol-relative "//evil.example" is absolute to the browser but would
  // read as a path here, so reject it before anything else.
  if (target.startsWith("//")) return APP_ROOT;
  if (target.startsWith("/")) return target;
  try {
    const url = new URL(target);
    return url.origin === publicOrigin(req)
      ? `${url.pathname}${url.search}${url.hash}`
      : APP_ROOT;
  } catch {
    return APP_ROOT;
  }
}

// An app whose SPAs don't sit at "/" (labs serves each experiment at
// /<project>/) passes ?return_to=<here> to /auth/login; it's stashed in the
// session and honoured by /auth/callback. Absent, everything behaves as before.
function requestedReturnTo(req: Request): string {
  const q = req.query.return_to;
  return typeof q === "string" && q !== "" ? q : APP_ROOT;
}

export async function setupAuth(
  app: Express,
  opts: AuthOptions,
): Promise<{ requireAuth: RequestHandler }> {
  // Resolved through @frediverse/env so these come from the caller's section in
  // the root env.yaml (and from process.env in a container, where no yaml
  // exists) — rather than this library reaching into process.env itself.
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SESSION_SECRET } =
    defineEnv(
      {
        OIDC_ISSUER: z.string().optional(),
        OIDC_CLIENT_ID: z.string().optional(),
        OIDC_CLIENT_SECRET: z.string().optional(),
        SESSION_SECRET: z.string().default("dev-insecure-secret-change-me"),
      },
      { service: opts.service },
    );

  const scope = (opts.scopes ?? ["openid", "profile", "email"]).join(" ");
  const mounted = new Set<AuthRoute>(opts.mountRoutes ?? ALL_ROUTES);
  const toUser = opts.mapUser ?? defaultMapUser;

  app.set("trust proxy", 1);
  app.use(
    sessionMiddleware({ cookieName: opts.cookieName, secret: SESSION_SECRET }),
  );

  const devMode = !OIDC_ISSUER || !OIDC_CLIENT_ID;
  let client: Client | null = null;

  if (devMode) {
    console.warn(
      "⚠️  OIDC not configured — running in DEV AUTH mode (stub 'Dev User').\n" +
        "    Set OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET for real auth.",
    );
  } else {
    const issuer = await Issuer.discover(OIDC_ISSUER!);
    client = new issuer.Client({
      client_id: OIDC_CLIENT_ID!,
      client_secret: OIDC_CLIENT_SECRET,
      // No redirect_uris here: it's per-request now (redirectUriFor), so every
      // call below passes it explicitly rather than defaulting to a fixed one.
      response_types: ["code"],
    });
    console.log(`🔐 OIDC enabled — issuer ${OIDC_ISSUER}`);
  }

  // --- Routes ---------------------------------------------------------------
  // Each is opt-out via opts.mountRoutes, for an app that answers it itself.

  if (mounted.has("login"))
    app.get("/auth/login", (req: Request, res: Response) => {
      const session = req.session!;
      const return_to = requestedReturnTo(req);
      if (devMode) {
        // The stub carries no groups, so isAdmin() stays false for it.
        session.user = {
          sub: "dev-user",
          name: "Dev User",
          email: "dev@example.com",
          groups: [],
        };
        return res.redirect(safeReturnTarget(return_to, req));
      }
      const code_verifier = generators.codeVerifier();
      const state = generators.state();
      const nonce = generators.nonce();
      // return_to rides in the session rather than the redirect_uri: the latter
      // must match byte-for-byte between login and callback, and the IdP checks
      // it against its registered list.
      session.oidc = { code_verifier, state, nonce, return_to };
      res.redirect(
        client!.authorizationUrl({
          redirect_uri: redirectUriFor(req),
          scope,
          code_challenge: generators.codeChallenge(code_verifier),
          code_challenge_method: "S256",
          state,
          nonce,
        }),
      );
    });

  if (mounted.has("callback"))
    app.get("/auth/callback", async (req: Request, res: Response) => {
      if (devMode) return res.redirect(APP_ROOT);
      try {
        const session = req.session!;
        const params = client!.callbackParams(req);
        const { code_verifier, state, nonce, return_to } = session.oidc || {};
        const tokenSet = await client!.callback(redirectUriFor(req), params, {
          code_verifier,
          state,
          nonce,
        });
        const claims = tokenSet.claims();
        // The ID token often omits the display name (and some IdPs — authentik
        // — only put sub+groups in it), while the UserInfo endpoint has them.
        // Merge it in (best-effort) so we can show a real name.
        let profile: Record<string, unknown> = claims;
        try {
          const info = await client!.userinfo(tokenSet);
          profile = { ...claims, ...info };
        } catch {
          /* UserInfo is optional — fall back to the ID-token claims */
        }
        session.user = toUser(profile);
        delete session.oidc;
        res.redirect(safeReturnTarget(return_to ?? APP_ROOT, req));
      } catch (err) {
        console.error("OIDC callback error:", (err as Error).message);
        res
          .status(401)
          .send("Authentication failed. <a href='/auth/login'>Try again</a>");
      }
    });

  if (mounted.has("logout"))
    app.post("/auth/logout", (req: Request, res: Response) => {
      // Clearing the session object tells cookie-session to expire the cookie.
      req.session = null;
      res.json({ ok: true });
    });

  if (mounted.has("me"))
    app.get("/auth/me", (req: Request, res: Response) => {
      if (!req.session!.user)
        return res.status(401).json({ error: "unauthenticated" });
      res.json({ user: req.session!.user });
    });

  // --- Middleware -----------------------------------------------------------

  const requireAuth: RequestHandler = (req, res, next) => {
    if (!req.session!.user)
      return res.status(401).json({ error: "unauthenticated" });
    req.user = req.session!.user;
    next();
  };

  return { requireAuth };
}

// Best display name from OIDC claims/UserInfo, widest-to-narrowest, ending at
// the opaque subject id only when nothing human-readable is available.
function displayName(p: Record<string, unknown>): string {
  const full = [p.given_name, p.family_name].filter(Boolean).join(" ").trim();
  return String(
    p.name || p.preferred_username || p.nickname || full || p.email || p.sub,
  );
}

// The `groups` claim, defensively: IdPs that don't send it omit it entirely,
// and a misconfigured mapping can send a bare string instead of an array.
function groupsOf(p: Record<string, unknown>): string[] {
  const g = p.groups;
  if (Array.isArray(g)) return g.map(String);
  return typeof g === "string" && g !== "" ? [g] : [];
}

function defaultMapUser(profile: Record<string, unknown>): SessionUser {
  return {
    sub: profile.sub as string,
    name: displayName(profile),
    email: (profile.email as string) || null,
    groups: groupsOf(profile),
  };
}
