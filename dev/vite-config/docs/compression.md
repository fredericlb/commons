# Compression: done once, at build time

Every app built with `defineAppConfig` gets a `.gz` and a `.br` beside each text asset
(`vite-plugin-compression2`, its defaults: js, css, html, svg, json; a file the codec does not
shrink is skipped). The servers send those files as they are and compress nothing per request.

## Why at build time

- **A bundle is compressed once per release, not once per request.** Brotli at its highest
  quality is a fifth smaller than gzip on these bundles, and far too slow to run on a request.
  At build time its cost is a few seconds of CI.
- **The servers stay dumb.** The Express backends and nginx only pick a file. No compression
  middleware means no CPU per request and no streaming buffer to tune.
- **No one in front is trusted to do it.** Traefik compresses only when a router is given a
  `compress` middleware, which is a deployment's choice, not the app's. The apps carry their own.

## Who serves what

| server | sends | where |
|---|---|---|
| an Express backend serving its own SPA | `.br`, else `.gz`, else the file | `@frediverse/http/precompressed`, a drop-in for `express.static` |
| nginx in `frediverse-base` | `.gz`, else the file | `dev/docker-runtime/gzip-static.conf` |

nginx sends no brotli: the stock Alpine package has no brotli module, and gzip is most of the
gain.

## What a reader gets wrong

- **The `.gz` and `.br` files are not precached.** The service worker's `globPatterns`
  (`docs/pwa.md`) do not match them, and they must not: a worker answers with the bytes it
  cached, and the browser decodes those itself.
- **`Vary: Accept-Encoding` is on every static response**, compressed or not. A cache in
  between must not hand the `.br` bytes to a client that never asked for them.
- **Ranges are off on a compressed response.** A range would count encoded bytes. Media is
  never precompressed, so the files that need ranges never take this path.
