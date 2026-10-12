# @frediverse/docker-runtime

The container runtime bits every app image shares. Unlike the other packages
here, nothing `import`s this — the **`Dockerfile` alongside this README** bakes
these files into the base image (`frediverse-base`), and each app's final stage
inherits them via `FROM ${BASE_IMAGE}`.

It is built from the **repo root** (`-f dev/docker-runtime/Dockerfile`), like
every app image, so its `COPY` paths are repo-root-relative.

| File | Baked in as | What it does |
|------|-------------|--------------|
| `entrypoint.sh` | `/entrypoint.sh` (the base image's `ENTRYPOINT`) | Runs the app's backend — whatever its `CMD` is — alongside nginx, and tears both down if either dies. |
| `proxy-common.conf` | `/etc/nginx/snippets/proxy-common.conf` | The `proxy_set_header` block every app repeated in each proxying `location`. |
| `gzip-static.conf` | `/etc/nginx/http.d/gzip-static.conf` | `gzip_static on` for every app: the `.gz` the Vite build wrote beside an asset is sent instead of the asset (`dev/vite-config/docs/compression.md`). |

The Dockerfile also settles two things every app inherits:

- **nginx runs under any uid.** Its scratch and log dirs (`/var/lib/nginx`,
  `/var/log/nginx`, `/run/nginx`) are pre-created and world-writable, because the
  apk package owns them as `root:nginx`. Without this, a deployment that sets
  `user:` in compose — e.g. to match a bind-mounted file's owner — gets
  `[emerg] ... (13: Permission denied)` from nginx, the entrypoint tears the
  container down, and it restart-loops. Running as root still works unchanged.
- **nginx logs go to the container's stdout/stderr**, so `docker logs` shows them
  next to the backend's rather than burying them in unrotated files. Apps
  therefore must not set their own `access_log`/`error_log`; inherit these.

A caveat if you do run non-root: binding `:80` needs
`net.ipv4.ip_unprivileged_port_start=0` (Docker's default) or
`NET_BIND_SERVICE`. On a runtime without either, front nginx on a high port.

## Using them

An app image sets only its own backend command:

```dockerfile
FROM ${BASE_IMAGE} AS runtime
CMD ["node", "--experimental-strip-types", "src/server.ts"]   # or: ["node", "dist/index.js"]
```

and includes the proxy snippet in its `nginx.conf`:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    include /etc/nginx/snippets/proxy-common.conf;
}
```

## Overriding the entrypoint

An app that needs different supervision copies its own over `/entrypoint.sh`
(the base's `ENTRYPOINT` already points there). Nothing does this today: studio's
`z0` did, restarting its backend on crash instead of taking the container down, and
gave it up when it joined studio's monolith image — one container, one lifecycle.

A monolith does not need the override anyway: its `CMD` is a launcher
(`run-backends.sh` in both phare and studio) that spawns every backend and exits
as soon as one of them dies, which is this file's rule applied to a set.

Keep genuinely app-specific nginx behaviour in the app's own `nginx.conf`: SSE
(`proxy_buffering off`) and websocket (`Upgrade`/`Connection`) locations need
header ordering the shared snippet can't express.
