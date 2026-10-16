# Sessions: a signed cookie, and what makes it still valid

The session is the user object in a cookie signed by `cookie-session`, not a record on the server, so
it survives a backend restart. A signature proves who MINTED the cookie, and nothing about time:
`cookie-session` signs no expiry into the payload, and a copied cookie would be accepted for as long
as `SESSION_SECRET` lasts. So every session carries stamps, and `setupAuth` checks them on every
request, before any route reads the session (`session.ts`, `validSessionUser`).

## What a session must carry

| stamp | set at | refused when |
|---|---|---|
| `iat` | sign-in | missing; or earlier than the subject's revocation epoch; or, for a session with `groups`, older than `groupsMaxAgeMs` |
| `exp` | sign-in, `iat + sessionMaxAgeMs` | missing, or past |

A session without the stamps is refused outright, which logs out every session minted by code that
did not stamp them, once. `sessionCookieHeader` stamps what it mints, so a test or a guest session
built by hand passes the same check.

A refused session loses its user (and its stamps), and keeps anything else it held, such as an
in-flight login's PKCE state. `requireAuth`, `/auth/me` and `sessionFromCookieHeader` all see it as
signed out.

## Lifetimes

- **`sessionMaxAgeMs`, 7 days by default**, from the sign-in, not from the last request. It is also
  the cookie's `maxAge`.
- **`groupsMaxAgeMs`, 12 hours by default**, for a session that carries at least one group. Groups
  come from the IdP at sign-in and nowhere else: the flow keeps no refresh token, so the only way to
  read them again is a new sign-in. A session with groups therefore ends after 12 hours, and a group
  removed at the IdP stops counting within that bound. A session with no groups has nothing to lose
  that way, and lives its full 7 days.

When the IdP's own session is still alive, the new sign-in is a redirect and no password.

## Revocation

`revocations` holds a "not before" epoch per subject: a session whose `iat` is earlier is dead.
`POST /auth/logout?everywhere=1` sets it for the signed-in subject, and `revokeSessions(sub)` (from
`setupAuth`'s handle) lets an app do the same when it removes someone. The package holds no storage
opinion: the default is in memory, so a revocation lasts until the process restarts;
`createSessionRevocations({ file })` persists it as JSON, and any object with `notBefore`/`revoke`
fits. `notBefore` runs on every request, so it answers from memory.

## Logout is same-origin

`POST /auth/logout` is refused (403) when the browser says the request came from another site: an
`Origin` that is neither this origin nor in `trustedOrigins`, or no `Origin` and a `Sec-Fetch-Site`
other than `same-origin`/`none`. A request with neither header is no browser's, and cannot be made
to carry somebody's cookie.

## The cookie's domain and SameSite

`cookieDomain` (or the env's `COOKIE_DOMAIN`) shares one cookie across subdomains. Such a cookie is
then read by cross-site fetches and media loads, which a `SameSite=Lax` cookie never rides on, so it
becomes `SameSite=None` — which a browser accepts only with `Secure`, so a shared-domain deployment
is HTTPS. Every service sharing the cookie must compute the same domain, or one of them stamps a
second, host-only cookie that shadows the shared one; that is why it resolves from the env's
`common` section rather than per caller.

## Return targets

`safeReturnTarget` resolves the target against the request's origin, as the browser will, and keeps
it only when it lands on this origin or a trusted one. Matching text instead fails on targets such
as `/\evil.com`, which the redirect leaves untouched and the browser reads as `//evil.com`. Control
characters, a leading pair of slashes or backslashes, and a path that resolves to `//…` are refused.
