// Host derivation for single-origin frediverse backends.
//
// The whole monorepo is single-origin: the SPA is served at / and the backend
// at /api on the SAME host, so nothing host-shaped is ever configured — no
// app URL in the environment. Anything absolute (the OIDC redirect_uri, the
// cookie's Secure flag, a canonical link) is derived from the incoming request
// instead. These two helpers are that derivation, and they were living verbatim
// in both @frediverse/oidc (openid-client based) and apps/obscura's
// hand-rolled auth (jose based). Extracted here so the two auth stacks share
// ONE copy without either taking on the other's dependencies. Reachable as
// @frediverse/http/origin — its own entry point, so importing it never drags
// in the routing helpers' `req.user` augmentation.
//
// NOTE: safeReturnTarget is deliberately NOT here. The two stacks' versions
// have diverged in observable, test-locked ways (obscura returns a
// same-origin absolute URL unchanged; @frediverse/oidc reduces it to a path,
// and additionally rejects protocol-relative "//host" targets). Unifying it
// would be an auth behaviour change, so it stays local to each.

import type { Request } from "express";

// The public origin this request came in on. Single origin means there's no
// configured host to build absolute URLs from, so we read it off the request:
// the edge (Caddy in dev, the image's nginx in prod) sets X-Forwarded-Proto and
// preserves Host, and `app.set("trust proxy", …)` makes req.protocol honour the
// forwarded scheme. X-Forwarded-Host wins when present (it may be a
// comma-separated chain — the first hop is the client-facing one).
export function publicOrigin(req: Request): string {
  const forwarded = req.get("x-forwarded-host");
  const host = (forwarded?.split(",")[0] ?? req.get("host") ?? "").trim();
  return `${req.protocol}://${host}`;
}

// The OIDC redirect_uri must be ABSOLUTE, so it's derived per request rather
// than configured. /auth/* reaches the backend with its prefix intact (only
// /api is stripped by the proxy), so the callback is <origin>/auth/callback.
//
// login and callback must present an IDENTICAL redirect_uri or the token
// exchange is rejected; both are top-level navigations to the same public
// origin, so they agree.
export function redirectUriFor(req: Request): string {
  return `${publicOrigin(req)}/auth/callback`;
}
