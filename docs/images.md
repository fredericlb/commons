# Docker images

Every app ships as one image: nginx serving its built SPA(s) and reverse-proxying
`/api` (+ `/auth`) to its backend on the loopback. Single origin, so the SPAs use
relative paths and no per-app build args are needed.

## The two build contexts

This is the part that bites. There are **two** different contexts in play:

| built from | context | why |
|---|---|---|
| the base image (`dev/docker-runtime/Dockerfile`) | `commons/` | it `COPY`s `dev/docker-runtime/entrypoint.sh`, which only resolves from commons' own root |
| each app image (`apps/<app>/docker/Dockerfile`) | the **consumer repo** root | it `COPY`s `apps/<app>/...` and needs the workspace tree, including `commons/` |

`scripts/build-images.sh` handles both: it is invoked from the consumer repo's
root and passes `commons/` explicitly as the context for the base image only.

In CI they are separated further: commons' own pipeline builds and pushes the
base image, and studio/phare pull it via `--build-arg BASE_IMAGE=…` rather than
rebuilding it. That's what keeps the base from being built three times.

## Why `turbo prune` matters

Each app's Dockerfile runs `turbo prune <backend> <frontend> --docker` to get a
minimal workspace, then a second backend-only prune for the runtime stage. Since
`commons/packages/*` and `commons/dev/*` are declared in the consumer's npm
workspaces, turbo resolves them like any other workspace package and they land
in `out/full/commons/packages/…`. The Dockerfiles' `COPY` paths don't care —
they're relative to the context root either way.

## The closure check

`node commons/scripts/check-image-closure.cjs` runs the prunes and asserts each
backend's pruned tree contains every workspace package it transitively depends
on. This guards a bug that reached production twice: `node_modules/<workspace
pkg>` entries are symlinks into the workspace, so a package missing from the
runtime stage is a dangling link and an `ERR_MODULE_NOT_FOUND` on first import.

It checks **all** workspace packages, not just the `@frediverse/*` ones — an
app-local package (`@radiok7/shared`, `@lanes/song`) fails exactly the same way.

Run it with no arguments to check every `*-backend` package in the repo, or pass
specific names.
