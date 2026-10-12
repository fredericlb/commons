# OIDC discovery: on first use, never at boot

`setupAuth` does not wait for the IdP's discovery document. It is fetched on the first
`/auth/login` or `/auth/callback`, cached once it succeeds, and dropped when it fails so the next
login asks again. A service that mounts neither route never fetches it at all.

## Why

- **Most of what this package does needs no IdP.** Verifying a session is checking a cookie's
  signature, and that is all most requests ask for. Only signing in talks to the IdP.
- **The process that does the auth flow also serves things.** A backend that awaits discovery at
  boot exits when the IdP is unreachable, and its container restart-loops. For a backend that
  serves its own SPA, people already signed in then lose the whole app, not just a login.
  Discovery's own timeout is 3.5 s, so an IdP that is merely slow at that moment was enough.
- **A failure must not be cached.** A discovery that failed once would otherwise fail every
  login until a restart, which is the outage moved rather than removed.

## What a reader gets wrong

- **Boot still tries.** When the routes are mounted, discovery starts at boot without being
  awaited, so the first login does not pay for it. A failure there is a warning in the log.
- **An unreachable IdP is a 503 on `/auth/login`**, with a link to try again. It is not a 401:
  nothing is wrong with the person's credentials.
