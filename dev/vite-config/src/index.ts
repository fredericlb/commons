import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { mergeConfig, type ProxyOptions, type UserConfig } from "vite";

// The Vite setup every SPA in this monorepo repeated verbatim: React +
// Tailwind v4, the `@` -> src alias, and the single-origin dev proxy that
// mirrors what nginx does in the image (SPA at /, backend at /api).
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
  /** App-specific config, merged over the preset. */
  extend?: UserConfig;
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
    plugins: [react(), tailwindcss()],
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
