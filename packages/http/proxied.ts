// proxied.ts — the timeouts a Node server needs when a reverse proxy pools connections to it.
// Node drops an idle keep-alive socket after 5 s; Traefik keeps one for 90 s and reuses it, so
// a request sent as Node closes it comes back a 502. See docs/proxied.md.

import type { Server } from "node:http";

/** Longer than Traefik's 90 s idle pool, so the proxy is always the side that closes. */
const KEEP_ALIVE_MS = 95_000;

/** Sets the server's keep-alive above the proxy's; returns it, so it wraps `app.listen(...)`. */
export function behindProxy<T extends Server>(server: T): T {
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  // Node requires headersTimeout above keepAliveTimeout, or a slow first request on a reused socket is cut.
  server.headersTimeout = KEEP_ALIVE_MS + 1_000;
  return server;
}
