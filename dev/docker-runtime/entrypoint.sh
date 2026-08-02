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
# (obscura deliberately supervises/restarts its backend instead and ships its
# own entrypoint — see apps/obscura/docker/entrypoint.sh.)
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
