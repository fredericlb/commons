# syntax=docker/dockerfile:1
#
# The shared base image for every app image in this monorepo.
#
# Build it first, then each apps/<app>/Dockerfile starts its final stage from it:
#
#   FROM frediverse-base AS runtime
#
# `build.sh` builds/tags it locally before the apps; CI builds and pushes it as
# its own job that the per-app jobs depend on.
#
# What lives here is what every app image shares:
#   - the Node runtime + nginx
#   - the entrypoint that runs the app's backend (its CMD) alongside nginx
#   - the common nginx proxy snippet
#
# What deliberately does NOT live here: anything app-specific (extra packages
# like ffmpeg, the app's nginx.conf, ports, volumes, CMD). Per-app dependency
# installs can't live here either — each consumer's own Dockerfile scopes its
# own install to that app's package set.

FROM node:22-alpine

# nginx serves each app's built SPA and reverse-proxies its API on the loopback.
RUN apk add --no-cache nginx

# Teach nginx about .mjs — its mime.types has no entry for it, so it falls back
# to default_type and a module script (`new Worker(url, {type:"module"})`, a
# dynamic import) is refused by the browser's strict MIME check. Any Vite build
# shipping a library's .mjs worker verbatim hits this; calepin's pdf.js one did.
# The grep makes a mime.types that stopped matching fail the build, loudly.
RUN sed -i 's|^types {|types {\n    application/javascript                           mjs;|' /etc/nginx/mime.types \
 && grep -q 'mjs;' /etc/nginx/mime.types

# Let nginx run as ANY uid, not just root.
#
# The apk package owns these dirs as root:nginx, so nginx started by a
# non-root user (a deployment's `user:` in compose, e.g. to match a bind-mounted
# file's owner) can't create its error log or its client_body temp dir and dies
# with `[emerg] ... (13: Permission denied)`. The entrypoint then tears the
# container down, so it restart-loops.
#
# The uid isn't knowable at build time, so these get opened to all. They hold
# only nginx's own scratch and logs, and the alternative — forcing every
# deployment to run as root — is the worse trade. `a+rwX` sets execute on the
# directories only, not on the files inside them.
#
# The symlinks then send nginx's logs to the container's stdout/stderr, so they
# show up in `docker logs` alongside the backend's instead of accumulating in
# files nobody reads (and nothing rotates). None of the app configs set their own
# access_log/error_log, so redirecting the main config's paths covers them all.
# The /var/lib/nginx/logs one is nginx's compiled-in default, used for errors
# raised before the config is parsed — exactly the ones worth seeing.
#
# chmod runs BEFORE the symlinks are made: `chmod -R` would otherwise follow them
# and change the permissions of /dev/stdout and /dev/stderr themselves.
RUN mkdir -p /var/lib/nginx/logs /var/lib/nginx/tmp /var/log/nginx /run/nginx \
 && chmod -R a+rwX /var/lib/nginx /var/log/nginx /run/nginx \
 && ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log \
 && ln -sf /dev/stderr /var/lib/nginx/logs/error.log

# Shared runtime bits.
COPY dev/docker-runtime/entrypoint.sh /entrypoint.sh
COPY dev/docker-runtime/proxy-common.conf /etc/nginx/snippets/proxy-common.conf
COPY dev/docker-runtime/gzip-static.conf /etc/nginx/http.d/gzip-static.conf
RUN chmod +x /entrypoint.sh

WORKDIR /app

# nginx fronts every app on :80. Apps that also expose their backend directly
# (e.g. z0's 8080) add their own EXPOSE.
EXPOSE 80

# The backend command comes from each app's CMD; see dev/docker-runtime/entrypoint.sh.
ENTRYPOINT ["/entrypoint.sh"]
