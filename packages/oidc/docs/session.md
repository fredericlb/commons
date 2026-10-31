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
  come from the IdP at sign-in and nowhere else: the session's user is never read again (a kept
  refresh token, below, renews the access token only), so the only way to read them again is a new sign-in. A session with groups therefore ends after 12 hours, and a group
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

## Choosing another account at sign-in

`/auth/login?prompt=login` passes `prompt=login` to the provider, which then shows its sign-in page
even while it holds a session of its own. Without it, an app that signs a person out to let them pick
another account gets the same account straight back from the provider's session.

## Keeping the provider's token

`keepAccessToken` (default off) keeps the provider's access token of each sign-in, for an app that
must later prove the person to a third party on the same provider — an app on the person's machine
pairing itself with a server, say (`accessToken(req)`). It is never sent to the browser, and never written:

- **Not in the cookie.** The cookie is signed, not encrypted: its payload is readable by whoever
  holds it, and it lives a week where the token lives an hour. The cookie carries an opaque random
  key; the token sits in this process's memory under that key (`providerTokens.ts`), bounded in
  number, and dies with the process. A restart costs the token, not the session: `accessToken`
  answers null and the app falls back to whatever it did without one.
- **Bound to the subject it was kept for**, and to the session's own end. A session whose user changed
  (the local user signing in, a handoff into another account) holds a key to nothing; a session
  refused by its stamps or its revocation epoch gets null, since `accessToken` reads only a valid one.
  A logout forgets it.
- **A handoff carries the key, not the token.** `sessionStamps` names the key (`kept`) and
  `startSession(req, user, from)` gives it to the new session, so an app's view signed in from the
  system browser shares that browser session's token. The key opens nothing without a session cookie
  signed by this process.
- **`keepRefreshToken`** keeps the refresh token too, when the provider hands one (most only do for
  the `offline_access` scope, which the app adds to its scopes and the provider's client must allow).
  An expired access token is then renewed on its next read; without one, an expired token is null.

`userinfoFor(token)` and `introspect(token)` are the other side: a server asked to trust a token a
caller presents asks its own provider about it, never the provider the caller names. `introspect` is
null when this client cannot introspect: a public client (no secret) cannot authenticate to the
endpoint, and a provider may have none. Both are null in dev mode.
