# A server behind a pooling proxy

`behindProxy(server)` (`proxied.ts`) sets a backend's keep-alive to 95 s, above the 90 s for which
Traefik keeps an idle connection to a backend before closing it.

## Why

Whichever side closes an idle connection first has to be the proxy. Node closes after 5 s by
default. A proxy that reuses the socket at the moment Node closes it sends a request into a closed
connection, and the browser gets a 502 for a request the backend never saw. Nothing in either log
explains it, and it happens rarely enough to look like noise.

With the backend waiting longer than the proxy, the proxy always closes first, and it never
reuses a connection it has already closed.

## What a reader gets wrong

- **`headersTimeout` has to move too.** Node expects it to be above `keepAliveTimeout`. Below it,
  a reused connection whose next request's headers arrive slowly is cut while it is still in use.
- **95 s is tied to Traefik's default.** A proxy configured with a longer idle timeout needs a
  longer value here.
