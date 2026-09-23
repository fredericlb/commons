# `cors: false` — the backend already answers, Vite must not answer first

Every backend that takes calls from a sibling origin sets its own CORS headers, trusting an
explicit list (`createTrustedOriginCors`, `apps/pl8/backend/src/cors.ts` and its siblings) —
never a wildcard, since the session cookie rides along. That is the one source of truth for
which origins may call which service.

Vite's own default (`server.cors: true`) answers a preflight `OPTIONS` for a **proxied** path
itself, generically, before the request ever reaches `proxy` and the real backend behind it. Its
answer carries no `Access-Control-Allow-Origin` at all for a caller Vite does not itself
recognise — which is every sibling app, since Vite's notion of "allowed" has nothing to do with
`TRUSTED_ORIGINS`. A browser then refuses the real request for a reason the backend never got a
chance to answer, and the failure reads as the backend's CORS being wrong when the backend was
never asked.

`cors: false` turns Vite's own handling off entirely, so `OPTIONS` reaches the proxy — and the
backend — exactly like `GET` does. Dev then fails and succeeds for the same reason production
does, which is the whole point of the dev proxy mirroring the edge in the first place.
