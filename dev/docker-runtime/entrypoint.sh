#!/bin/sh
# Shared entrypoint, baked into the base image (see the repo-root Dockerfile).
#
# Runs the app's backend and nginx side by side in one container. The backend
# command is whatever the image's CMD is — so an app picks its own, e.g.
#   CMD ["node", "--experimental-strip-types", "src/server.ts"]   (type-stripped)
#   CMD ["node", "dist/index.js"]                                 (compiled)
#
# If either process dies, tear both down so the container exits and the
# orchestrator recycles it, instead of limping along with half the stack up.
#
# A monolith image makes its CMD a LAUNCHER rather than one server — phare's and
# studio's `run-backends.sh` — which spawns several backends and applies this same
# rule to the set: it exits as soon as any one of them does. studio's z0 used to
# override this file to restart its own backend in place; it lost that when it
# joined the studio image, since a shared container has one lifecycle.
set -e

if [ "$#" -eq 0 ]; then
  echo "entrypoint: no backend command given (set CMD in the app's Dockerfile)" >&2
  exit 1
fi

"$@" &
backend_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

trap 'kill -TERM $backend_pid $nginx_pid 2>/dev/null' TERM INT

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done

kill -TERM $backend_pid $nginx_pid 2>/dev/null
wait
exit 1
