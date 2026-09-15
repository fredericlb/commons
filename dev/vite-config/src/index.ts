import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  mergeConfig,
  type Plugin,
  type PluginOption,
  type ProxyOptions,
  type UserConfig,
} from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The Vite setup every SPA in this monorepo repeated verbatim: React +
// Tailwind v4, the `@` -> src alias, the single-origin dev proxy that
// mirrors what nginx does in the image (SPA at /, backend at /api), and the
// service worker that makes it installable. See docs/pwa.md for that last one.
//
//   export default defineAppConfig({
//     dir: import.meta.url,
//     port: 5173,
//     backendPort: 8787,
//     host: "rec.test",
//     proxyPaths: ["/auth"],
//     wsPaths: ["/rtc"],
//   });

export interface AppConfigOptions {
  /** The app's own directory — pass `import.meta.url`. Drives the `@` alias. */
  dir: string;
  /** Dev-server port. Fixed per app (see the Caddyfile). */
  port: number;
  /** Backend port the dev proxy forwards to. Production uses nginx instead. */
  backendPort: number;
  /**
   * Extra path prefixes to proxy alongside `/api` — e.g. `["/auth"]`. Anything
   * the backend owns, since the SPA only ever uses relative paths.
   */
  proxyPaths?: string[];
  /** Prefixes needing a websocket upgrade (e.g. `["/rtc"]`). Implies proxying. */
  wsPaths?: string[];
  /**
   * The `.test` host Caddy fronts. Adds it to allowedHosts and points HMR at
   * :443, since Caddy terminates TLS and the HMR socket must reach the browser
   * as wss on the public port.
   */
  host?: string;
  /**
   * Strip the `/api` prefix before forwarding to the backend, for a backend
   * that serves BARE paths (`/songs`, not `/api/songs`). z0's does —
   * its Caddy block runs `uri strip_prefix /api` — so the dev proxy has to
   * match the edge. Most backends mount their routes under /api natively, so
   * this stays off by default and only z0 opts in.
   */
  stripApiPrefix?: boolean;
  /** Poll for changes — needed under WSL against /mnt/c, where inotify is mute. */
  poll?: boolean;
  /** Path prefix the app is served under. Defaults to "/" (the convention). */
  base?: string;
  /**
   * Navigations the service worker must NOT answer with this app's shell.
   *
   * Only an app served at the ORIGIN ROOT needs this. A worker's scope is the directory it was
   * served from, so an app under a `base` already controls nothing but its own prefix — while an
   * app at `/` controls the whole origin, its neighbours included. See docs/pwa.md.
   */
  pwaDenylist?: RegExp[];
  /** No service worker for this app. See docs/pwa.md for when that is the right answer. */
  pwa?: false;
  /** App-specific config, merged over the preset. */
  extend?: UserConfig;
}

/**
 * Building, rather than serving — read off the CLI because this returns a plain object and there
 * is no `({ command })` to close over. It gates one thing: `clientsClaim`.
 */
const IS_BUILD = process.argv.includes("build");

/**
 * A socket that resets must not take the dev server with it. An `upgrade` whose URL matches no
 * proxy context is handed to nobody — Vite's proxy loop simply returns — so the raw socket keeps
 * no `error` listener and node throws the unhandled event out of the event loop: `read ECONNRESET`
 * with a stack of nothing but `TCP.onStreamRead`, and the server gone.
 *
 * One listener, registered before the server accepts anything, is the whole fix. It is additive:
 * a socket the proxy DOES claim keeps http-proxy's own handling too, and this one only logs.
 */
const upgradeSocketGuard: PluginOption = {
  name: "frediverse:upgrade-socket-guard",
  configureServer(server) {
    server.httpServer?.on("upgrade", (req, socket) => {
      socket.on("error", (err: NodeJS.ErrnoException) => {
        // A browser going away mid-handshake is ordinary and not worth a line.
        if (err.code === "ECONNRESET" || err.code === "EPIPE") return;
        server.config.logger.warn(
          `upgrade socket error on ${req.url}: ${err.message}`,
          { timestamp: true },
        );
      });
    });
  },
};

/**
 * An app's prefix is an address people type and link, so the BARE form has to work: vite answers
 * `/f` under a base of `/f/` with a 404 page suggesting `/f/`, which reads like a dead link when
 * the address was right. The edge redirects it in production; this is the dev half. See docs/base.md.
 */
function bareBaseRedirect(prefix: string): Plugin {
  return {
    name: "commons:bare-base-redirect",
    configureServer(server) {
      // Installed from the hook BODY, so it runs ahead of vite's own base middleware.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (url !== prefix && !url.startsWith(`${prefix}?`)) return next();
        // 302, not 301: a permanent redirect to a dev port outlives the base it was cached for.
        res.writeHead(302, {
          Location: `${prefix}/${url.slice(prefix.length)}`,
        });
        res.end();
      });
    },
  };
}

export function defineAppConfig(options: AppConfigOptions): UserConfig {
  const dir = options.dir.startsWith("file:")
    ? path.dirname(fileURLToPath(options.dir))
    : options.dir;

  const target = `http://localhost:${options.backendPort}`;
  const wsPaths = new Set(options.wsPaths ?? []);
  const paths = new Set(["/api", ...(options.proxyPaths ?? []), ...wsPaths]);

  // "/f/" -> "/f"; "/" (or unset) -> "" (no prefix).
  const prefix = (options.base ?? "/").replace(/\/+$/, "");

  // Each backend path is proxied twice when the app is served under a prefix.
  //
  //   /api        — most SPAs call the backend at the ORIGIN ROOT even when
  //                 they're based at /buzzer/ or /acu/, because the backend
  //                 shares their origin and isn't under the SPA's prefix.
  //   /f/api      — an app the EDGE mounts under a prefix (douane at /f)
  //                 has all of its traffic under that prefix, API included, so
  //                 the SPA asks for /f/api/... Traefik strips /f before the
  //                 image's nginx sees it; this rewrite is the dev equivalent.
  //                 Without it those calls match no rule and Vite 404s them as
  //                 missing static files.
  // Remove the /api prefix a `stripApiPrefix` backend doesn't expect. Applied
  // to the /api entry only — /auth, /audio and the websocket paths reach the
  // backend with their prefix intact, exactly as they do through the edge.
  const stripApi = (path: string) => path.replace(/^\/api/, "");
  const needsStrip = (p: string) =>
    (options.stripApiPrefix ?? false) && p === "/api";

  const proxy = Object.fromEntries(
    [...paths].flatMap((p) => {
      const opts: ProxyOptions = {
        target,
        changeOrigin: true,
        // Send X-Forwarded-For/Host/Proto, like Caddy and the image's nginx do.
        //
        // Not optional: `changeOrigin` rewrites the Host header to the proxy
        // TARGET (localhost:<backendPort>), and the backends derive their own
        // public origin from the request — they have no configured URL to fall
        // back on. Without these headers a backend concludes it lives at
        // localhost:<backendPort> and hands the browser an OIDC redirect_uri /
        // post-login redirect pointing straight at itself, bypassing the SPA.
        // xfwd captures the original Host before changeOrigin overwrites it.
        xfwd: true,
        ...(wsPaths.has(p) ? { ws: true } : {}),
        ...(needsStrip(p) ? { rewrite: stripApi } : {}),
      };
      const entries: [string, ProxyOptions][] = [[p, opts]];
      if (prefix) {
        entries.push([
          `${prefix}${p}`,
          {
            ...opts,
            // Drop the SPA's own prefix, then (if the backend serves bare
            // paths) /api on top of it: /buzzer/api/songs -> /songs.
            rewrite: needsStrip(p)
              ? (path: string) => stripApi(path.slice(prefix.length))
              : (path: string) => path.slice(prefix.length),
          },
        ]);
      }
      return entries;
    }),
  );

  const preset: UserConfig = {
    ...(options.base ? { base: options.base } : {}),
    plugins: [
      ...(prefix ? [bareBaseRedirect(prefix)] : []),
      react(),
      tailwindcss(),
      upgradeSocketGuard,
      ...(options.pwa === false
        ? []
        : [
            VitePWA({
              // No forced reload, ever: the worker waits until every tab of this origin is
              // closed. `autoUpdate` would swap a running app's bundle out from under it, and
              // the shell left behind then asks for chunks the new precache no longer has.
              registerType: "prompt",
              // The app owns its `public/manifest.webmanifest`: name, icons and start_url are
              // its identity, not a preset's. st0 ships TWO and swaps between them.
              manifest: false,
              // Registered by the app, where its other document-level decisions live.
              injectRegister: null,
              workbox: {
                globPatterns: [
                  "**/*.{js,css,html,ico,png,svg,webmanifest,woff2}",
                ],
                // An SPA route has no file behind it, so a navigation gets the shell. Relative,
                // so it resolves against the worker's own scope and an app under a `base` needs
                // no special case.
                navigateFallback: "index.html",
                ...(options.pwaDenylist
                  ? { navigateFallbackDenylist: options.pwaDenylist }
                  : {}),
                cleanupOutdatedCaches: true,
                // Claim open pages in DEV only. A browser offers to install an app once a worker
                // CONTROLS the page; without this the affordance waits for a second navigation,
                // which nobody performs on a tablet. Off in a build for the reason above.
                clientsClaim: !IS_BUILD,
                skipWaiting: !IS_BUILD,
                maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              },
              // On in dev, because with no worker there is no worker at all — and the browser
              // then never offers to install, while the manifest and icons make everything LOOK
              // ready. It precaches nothing before a build.
              devOptions: {
                enabled: true,
                type: "module",
                suppressWarnings: true,
              },
            }),
          ]),
    ],
    resolve: { alias: { "@": path.resolve(dir, "src") } },
    server: {
      host: true,
      port: options.port,
      // Ports are fixed per app, so a collision should fail loudly rather than
      // silently move the app to another port.
      strictPort: true,
      proxy,
      ...(options.host
        ? { allowedHosts: [options.host], hmr: { clientPort: 443 } }
        : {}),
      ...(options.poll ? { watch: { usePolling: true, interval: 300 } } : {}),
    },
  };

  return options.extend ? mergeConfig(preset, options.extend) : preset;
}
