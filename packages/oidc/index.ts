// Shared OIDC (OpenID Connect) authentication for the frediverse apps: the Authorization Code flow
// with PKCE (openid-client), the user kept in a SIGNED cookie (cookie-session) rather than in memory,
// so a session survives a backend restart. Nothing host-shaped is configured: the redirect_uri, the
// post-login target and the cookie's Secure flag all derive from the request.
// What a reader gets wrong: a signed cookie is not a valid session. Its stamps (iat, exp), the age
// of its groups and the subject's revocation epoch are checked on every request (docs/session.md).
// Without OIDC_ISSUER / OIDC_CLIENT_ID the server runs a DEV stub user instead of an IdP.

import { defineEnv, z } from "@frediverse/env";
import { publicOrigin, redirectUriFor } from "@frediverse/http/origin";
import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { Client } from "openid-client";
import { KEPT_FIELD, providerTokens } from "./providerTokens.ts";
import {
  APP_ROOT,
  isSameOriginRequest,
  safeReturnTarget,
} from "./returnTarget.ts";
import {
  clearSessionUser,
  createSessionRevocations,
  SESSION_MAX_AGE_MS,
  type SessionPolicy,
  type SessionRevocations,
  type SessionUser,
  sessionMiddleware,
  stampSession,
  validSessionUser,
} from "./session.ts";

// The other way in: HMAC bearer tokens for clients that can't hold a cookie.
export {
  API_TOKEN_TTL_MS,
  type ApiTokenRecord,
  type ApiTokenStore,
  type ApiTokens,
  createApiTokens,
  fileTokenStore,
  type IssueOptions,
  memoryTokenStore,
} from "./apiToken.ts";
export { isSameOriginRequest, safeReturnTarget } from "./returnTarget.ts";
export {
  createSessionRevocations,
  GROUPS_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
  type SessionPolicy,
  type SessionRevocations,
  type SessionUser,
  sessionCookieHeader,
  sessionFromCookieHeader,
  sessionMiddleware,
  validSessionUser,
} from "./session.ts";
// Re-exported so importers of @frediverse/oidc need not know they live in @frediverse/http/origin.
export { publicOrigin, redirectUriFor };

/** The built-in routes setupAuth mounts. */
export type AuthRoute = "login" | "callback" | "logout" | "me";

const ALL_ROUTES: AuthRoute[] = ["login", "callback", "logout", "me"];

/** How long after setup the discovery is warmed: past a start, which it would otherwise share the CPU with. */
const WARM_DELAY_MS = 5_000;

export interface AuthOptions {
  /** Name of the session cookie (unique per app, e.g. "songs.sid"). */
  cookieName: string;
  /** The caller's section in the root env.yaml (e.g. "radiok7-backend"), where the OIDC settings resolve. */
  service: string;
  /** Scopes to request. Default ["openid", "profile", "email"]. */
  scopes?: string[];
  /** Which built-in routes to mount. Default: all; an app answering one itself omits it. */
  mountRoutes?: AuthRoute[];
  /** Shape the session user from the claims/UserInfo profile. Default { sub, name, email, groups }. */
  mapUser?: (profile: Record<string, unknown>) => SessionUser;
  /** `Domain=` for the cookie; default env's `COOKIE_DOMAIN`, "" opts out. Switches SameSite to None (docs/session.md). */
  cookieDomain?: string;
  /** Origins besides the request's own that a return target and a logout may come from; default env's `TRUSTED_ORIGINS`. */
  trustedOrigins?: string[];
  /** A session's lifetime from its sign-in. Default SESSION_MAX_AGE_MS (7 days). */
  sessionMaxAgeMs?: number;
  /** A session carrying groups is refused past this age, so a group removal lands. Default 12 h. */
  groupsMaxAgeMs?: number;
  /** Per-subject "not before" epochs. Default: in memory, so a revocation lasts until a restart. */
  revocations?: SessionRevocations;
  /** Keep the provider's access token for each session, in memory, for `accessToken(req)`. Default off (docs/session.md). */
  keepAccessToken?: boolean;
  /** With keepAccessToken, keep the refresh token too when the provider hands one, to renew an expired access token. */
  keepRefreshToken?: boolean;
}

/** A session's stamps, and the key of its kept provider token when it has one (a handoff carries it). */
export interface SessionStamps {
  iat: number;
  exp: number;
  kept?: string;
}

/** What setupAuth hands back. */
export interface AuthHandle {
  /** 401 unless the request carries a valid session; sets req.user. */
  requireAuth: RequestHandler;
  /** Sign `user` in on this request's session, stamped now (or with `from`'s stamps and kept token). */
  startSession(req: Request, user: SessionUser, from?: SessionStamps): void;
  /** The request's valid session user, or null. */
  sessionUser(req: Request): SessionUser | null;
  /** The request's session stamps, when it carries a valid user. */
  sessionStamps(req: Request): SessionStamps | null;
  /** Kill every session of `sub` issued until now: a logout everywhere, or an account removed. */
  revokeSessions(sub: string): void;
  /** The configured issuer, or null in dev mode. */
  issuer: string | null;
  /** The provider's access token kept for this request's session (keepAccessToken), or null. Never send it to a browser. */
  accessToken(req: Request): Promise<string | null>;
  /** The provider's UserInfo for a bearer token someone presents, or null when the provider refuses it. */
  userinfoFor(accessToken: string): Promise<Record<string, unknown> | null>;
  /** The provider's introspection of a token, or null when this client cannot introspect (no secret, no endpoint). */
  introspect(token: string): Promise<Record<string, unknown> | null>;
}

/** Case-insensitive group membership; the caller passes its own admin list, which is per-app config. */
export function isAdmin(
  user: SessionUser | null | undefined,
  adminGroups: readonly string[],
): boolean {
  if (!user) return false;
  const admin = adminGroups.map((g) => g.toLowerCase());
  return (user.groups ?? []).some((g) => admin.includes(g.toLowerCase()));
}

// An SPA not at "/" passes ?return_to=<here> to /auth/login; /auth/callback honours it.
function requestedReturnTo(req: Request): string {
  const q = req.query.return_to;
  return typeof q === "string" && q !== "" ? q : APP_ROOT;
}

type SessionBag = Record<string, unknown>;

// The session object, created when a route nulled it earlier in the same request.
function sessionOf(req: Request): SessionBag {
  req.session ??= {};
  return req.session as SessionBag;
}

export async function setupAuth(
  app: Express,
  opts: AuthOptions,
): Promise<AuthHandle> {
  // From the caller's env.yaml section, so every service sharing a cookie agrees on its domain (docs/session.md).
  const {
    OIDC_ISSUER,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    SESSION_SECRET,
    COOKIE_DOMAIN,
    TRUSTED_ORIGINS,
  } = defineEnv(
    {
      OIDC_ISSUER: z.string().optional(),
      OIDC_CLIENT_ID: z.string().optional(),
      OIDC_CLIENT_SECRET: z.string().optional(),
      SESSION_SECRET: z.string().default("dev-insecure-secret-change-me"),
      COOKIE_DOMAIN: z.string().optional(),
      TRUSTED_ORIGINS: z.string().optional(),
    },
    { service: opts.service },
  );
  // `!== undefined`, not `||`: an explicit "" opts out of the common section's value.
  const cookieDomain =
    opts.cookieDomain !== undefined
      ? opts.cookieDomain || undefined
      : COOKIE_DOMAIN || undefined;
  const trustedOrigins =
    opts.trustedOrigins ??
    (TRUSTED_ORIGINS
      ? TRUSTED_ORIGINS.split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : undefined);

  const scope = (opts.scopes ?? ["openid", "profile", "email"]).join(" ");
  const mounted = new Set<AuthRoute>(opts.mountRoutes ?? ALL_ROUTES);
  const toUser = opts.mapUser ?? defaultMapUser;
  const maxAgeMs = opts.sessionMaxAgeMs ?? SESSION_MAX_AGE_MS;
  const policy: SessionPolicy = {
    revocations: opts.revocations ?? createSessionRevocations(),
    groupsMaxAgeMs: opts.groupsMaxAgeMs,
  };

  app.set("trust proxy", 1);
  app.use(
    sessionMiddleware({
      cookieName: opts.cookieName,
      secret: SESSION_SECRET,
      domain: cookieDomain,
      maxAgeMs,
    }),
  );
  // A signed but expired, unstamped or revoked session loses its user here, before any route reads it.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const session = req.session as SessionBag | null | undefined;
    if (session?.user && !validSessionUser(session, policy))
      clearSessionUser(session);
    next();
  });

  const startSession: AuthHandle["startSession"] = (req, user, from) => {
    const session = sessionOf(req);
    stampSession(session, user, maxAgeMs, from);
    // A handoff's session shares its browser session's kept token; any other start holds none yet.
    if (from?.kept) session[KEPT_FIELD] = from.kept;
    else delete session[KEPT_FIELD];
  };
  const sessionUser = (req: Request): SessionUser | null =>
    validSessionUser(req.session as SessionBag | null | undefined, policy);

  const devMode = !OIDC_ISSUER || !OIDC_CLIENT_ID;

  // Loaded on first use: its evaluation is a cost every start pays for a login most starts never see (docs/discovery.md).
  let library: Promise<typeof import("openid-client")> | null = null;
  const openid = () => {
    library ??= import("openid-client");
    return library;
  };
  // Discovered on first use and never awaited at boot, so an unreachable IdP costs a login, not the server (docs/discovery.md).
  let discovery: Promise<Client> | null = null;
  const getClient = (): Promise<Client> => {
    const clientId = OIDC_CLIENT_ID;
    if (!OIDC_ISSUER || !clientId)
      return Promise.reject(new Error("OIDC is not configured"));
    discovery ??= openid()
      .then(({ Issuer }) => Issuer.discover(OIDC_ISSUER))
      .then(
        (issuer) => {
          console.log(`🔐 OIDC enabled — issuer ${OIDC_ISSUER}`);
          return new issuer.Client({
            client_id: clientId,
            client_secret: OIDC_CLIENT_SECRET,
            // No secret is a PUBLIC client (a desktop app cannot keep one): PKCE alone proves the callback.
            ...(OIDC_CLIENT_SECRET
              ? {}
              : { token_endpoint_auth_method: "none" }),
            // No redirect_uris: it is per-request (redirectUriFor), passed explicitly by every call below.
            response_types: ["code"],
          });
        },
        (err: Error) => {
          // Forgotten, so the next login asks again rather than replaying this failure.
          discovery = null;
          throw err;
        },
      );
    return discovery;
  };
  const tokens = providerTokens({
    getClient,
    sessionUser,
    keepRefresh: opts.keepRefreshToken === true,
    hasSecret: !!OIDC_CLIENT_SECRET,
  });

  if (devMode) {
    console.warn(
      "⚠️  OIDC not configured — running in DEV AUTH mode (stub 'Dev User').\n" +
        "    Set OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET for real auth.",
    );
  } else if (mounted.has("login") || mounted.has("callback")) {
    // Warmed once the start is over, so the first login does not wait for it; a failure here is only a log line.
    setTimeout(
      () =>
        getClient().catch((err: Error) =>
          console.warn(
            `⚠️  OIDC discovery failed (${err.message}) — retried on the next login`,
          ),
        ),
      WARM_DELAY_MS,
    ).unref();
  }

  // /auth/me and /auth/logout are fetched from trusted sibling origins, whose JS reads the answer only with these.
  if (trustedOrigins?.length) {
    app.use("/auth", (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      if (origin && trustedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      }
      if (req.method === "OPTIONS") return res.status(204).end();
      next();
    });
  }

  // --- Routes: each is opt-out via opts.mountRoutes ---

  if (mounted.has("login"))
    app.get("/auth/login", async (req: Request, res: Response) => {
      const session = sessionOf(req);
      const return_to = requestedReturnTo(req);
      if (devMode) {
        // The stub carries no groups, so isAdmin() stays false for it.
        startSession(req, {
          sub: "dev-user",
          name: "Dev User",
          email: "dev@example.com",
          groups: [],
        });
        return res.redirect(safeReturnTarget(return_to, req, trustedOrigins));
      }
      let client: Client;
      try {
        client = await getClient();
      } catch (err) {
        console.error("OIDC discovery error:", (err as Error).message);
        return res
          .status(503)
          .send(
            "The sign-in service cannot be reached. <a href='/auth/login'>Try again</a>",
          );
      }
      const { generators } = await openid();
      const code_verifier = generators.codeVerifier();
      const state = generators.state();
      const nonce = generators.nonce();
      // return_to rides in the session: the redirect_uri must match the IdP's registered list byte for byte.
      session.oidc = { code_verifier, state, nonce, return_to };
      res.redirect(
        client.authorizationUrl({
          redirect_uri: redirectUriFor(req),
          scope,
          code_challenge: generators.codeChallenge(code_verifier),
          code_challenge_method: "S256",
          state,
          nonce,
          // `?prompt=login` asks the provider for its sign-in page even when it holds a session: choosing another account.
          ...(req.query.prompt === "login" ? { prompt: "login" } : {}),
        }),
      );
    });

  if (mounted.has("callback"))
    app.get("/auth/callback", async (req: Request, res: Response) => {
      if (devMode) return res.redirect(APP_ROOT);
      try {
        const session = sessionOf(req);
        const client = await getClient();
        const params = client.callbackParams(req);
        const { code_verifier, state, nonce, return_to } = (session.oidc ??
          {}) as Record<string, string | undefined>;
        const tokenSet = await client.callback(redirectUriFor(req), params, {
          code_verifier,
          state,
          nonce,
        });
        const claims = tokenSet.claims();
        // The ID token often lacks the display name, which UserInfo has: merged in, best-effort.
        let profile: Record<string, unknown> = claims;
        try {
          const info = await client.userinfo(tokenSet);
          profile = { ...claims, ...info };
        } catch {
          /* UserInfo is optional — fall back to the ID-token claims */
        }
        const user = toUser(profile);
        startSession(req, user);
        if (opts.keepAccessToken)
          tokens.keep(session, String(user.sub ?? ""), tokenSet);
        delete session.oidc;
        res.redirect(
          safeReturnTarget(return_to ?? APP_ROOT, req, trustedOrigins),
        );
      } catch (err) {
        console.error("OIDC callback error:", (err as Error).message);
        res
          .status(401)
          .send("Authentication failed. <a href='/auth/login'>Try again</a>");
      }
    });

  if (mounted.has("logout"))
    app.post("/auth/logout", (req: Request, res: Response) => {
      // A cross-site page must not be able to sign anyone out.
      if (!isSameOriginRequest(req, trustedOrigins))
        return res.status(403).json({ error: "cross-site request refused" });
      const user = sessionUser(req);
      // ?everywhere=1 also kills the copies on every other device.
      if (req.query.everywhere === "1" && typeof user?.sub === "string")
        policy.revocations?.revoke(user.sub);
      tokens.drop(req.session as SessionBag | null | undefined);
      req.session = null;
      res.json({ ok: true });
    });

  if (mounted.has("me"))
    app.get("/auth/me", (req: Request, res: Response) => {
      // Same URL, different answer after a login or logout: never served from a cache.
      res.setHeader("Cache-Control", "no-store");
      const user = sessionUser(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      res.json({ user });
    });

  const requireAuth: RequestHandler = (req, res, next) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    // Typed by each app's own augmentation of Request; this package only knows SessionUser.
    (req as { user?: unknown }).user = user;
    next();
  };

  return {
    requireAuth,
    startSession,
    sessionUser,
    sessionStamps: (req) => {
      const s = req.session as SessionBag | null | undefined;
      if (!sessionUser(req) || !s) return null;
      const kept = s[KEPT_FIELD];
      return {
        iat: s.iat as number,
        exp: s.exp as number,
        ...(typeof kept === "string" ? { kept } : {}),
      };
    },
    revokeSessions: (sub) => policy.revocations?.revoke(sub),
    issuer: devMode ? null : (OIDC_ISSUER ?? null),
    accessToken: (req) =>
      devMode ? Promise.resolve(null) : tokens.accessToken(req),
    userinfoFor: (token) =>
      devMode ? Promise.resolve(null) : tokens.userinfoFor(token),
    introspect: (token) =>
      devMode ? Promise.resolve(null) : tokens.introspect(token),
  };
}

// Best display name from OIDC claims/UserInfo, ending at the opaque subject id only when nothing else is there.
function displayName(p: Record<string, unknown>): string {
  const full = [p.given_name, p.family_name].filter(Boolean).join(" ").trim();
  return String(
    p.name || p.preferred_username || p.nickname || full || p.email || p.sub,
  );
}

// The `groups` claim, defensively: absent, or a bare string from a misconfigured mapping.
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
