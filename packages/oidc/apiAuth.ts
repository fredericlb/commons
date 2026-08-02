// Accepting a personal access token where a session cookie is expected.
//
// Its own entry point (@frediverse/oidc/api-auth) rather than the barrel: it
// assigns req.user, so it pulls in @frediverse/http's global augmentation. The
// stacks that declare their own richer user shape import only the barrel and
// stay unaffected.

import type { RequestHandler } from "express";
import { createApiTokens } from "./apiToken.ts";

/**
 * Let a client authenticate with `Authorization: Bearer <token>` instead of the
 * session cookie. No bearer at all falls through to `requireAuth`, so browsers
 * are unaffected; a bearer that doesn't verify is rejected outright rather than
 * silently downgraded to the cookie.
 *
 * The token carries only a subject, so name/email are filled from it — an API
 * client never had a profile to begin with.
 */
export function bearerOrSession(
  requireAuth: RequestHandler,
  verify: (token: string) => string | null,
): RequestHandler {
  return (req, res, next) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
    if (!m) return requireAuth(req, res, next);
    const sub = verify(m[1].trim());
    if (!sub) return res.status(401).json({ error: "invalid token" });
    req.user = { sub, name: sub, email: null };
    next();
  };
}

/**
 * The common case: mint the token scheme from a secret and return both the
 * middleware and the issuer the /token route needs.
 */
export function apiTokenAuth(secret: string) {
  const { issue, verify } = createApiTokens(secret);
  return {
    issueApiToken: issue,
    verifyApiToken: verify,
    bearerOrSession: (requireAuth: RequestHandler) =>
      bearerOrSession(requireAuth, verify),
  };
}
