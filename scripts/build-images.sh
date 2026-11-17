#!/usr/bin/env bash
# Build and push one Docker image per app of the CALLING repo (studio, phare).
# Invoked from that repo's root — its Dockerfiles build with the repo root as
# context, so commons/ must be checked out. Apps come from argv or from
# apps/*/docker/Dockerfile. See commons/docs/images.md.
set -euo pipefail

REGISTRY=${REGISTRY:-dev.frediver.se/frediverse}
PLATFORM=${PLATFORM:-linux/amd64}
# The shared base image. commons' CI builds and pushes it; a local build makes
# its own copy so there's no registry round-trip just to iterate on an app.
BASE_IMAGE=${BASE_IMAGE:-frediverse-base:latest}

# The repo we're building for — the cwd, not commons.
REPO_ROOT=$(pwd)
REPO_NAME=$(basename "$REPO_ROOT")
COMMONS_DIR="$REPO_ROOT/commons"

if [[ ! -d "$COMMONS_DIR" ]]; then
  echo "error: no commons/ in $REPO_ROOT — run 'git submodule update --init'" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  APPS=("$@")
else
  APPS=()
  for d in "$REPO_ROOT"/apps/*/docker/Dockerfile; do
    [[ -e "$d" ]] || continue
    APPS+=("$(basename "$(dirname "$(dirname "$d")")")")
  done
fi

if [[ ${#APPS[@]} -eq 0 ]]; then
  echo "error: no apps/*/docker/Dockerfile found under $REPO_ROOT" >&2
  exit 1
fi

echo "=== repo: $REPO_NAME | apps: ${APPS[*]} ==="

# The base image is built with COMMONS as context, not the repo root: its
# Dockerfile COPYs dev/docker-runtime/... which only resolves from there.
echo "=== building $BASE_IMAGE (shared base, context=commons) ==="
docker buildx build \
  --platform "$PLATFORM" \
  -f "$COMMONS_DIR/dev/docker-runtime/Dockerfile" \
  -t "$BASE_IMAGE" \
  --load "$COMMONS_DIR"

for app in "${APPS[@]}"; do
  dockerfile="apps/$app/docker/Dockerfile"
  image="$REGISTRY/$REPO_NAME/$app"
  # Per-app, per-build-machine state — "<revision> <image-id>". Gitignored.
  rev_file=".docker-revision.$app"

  echo "=== building $image ($dockerfile) ==="

  # Build locally first (--load) so we can read the resulting image id and
  # decide whether the layers actually changed before spending an rN tag.
  docker buildx build \
    --platform "$PLATFORM" \
    -f "$dockerfile" \
    --build-arg "BASE_IMAGE=$BASE_IMAGE" \
    -t "$image:latest" \
    --load "$REPO_ROOT"

  new_id=$(docker image inspect --format '{{.Id}}' "$image:latest")

  prev_rev=0
  prev_id=
  if [[ -f "$rev_file" ]]; then
    read -r prev_rev prev_id < "$rev_file" || true
  fi

  # Docker's layer cache hashes layers by their inputs, so a no-op rebuild
  # yields the exact same image id. Only bump when the image actually differs.
  if [[ -n "$prev_id" && "$new_id" == "$prev_id" ]]; then
    rev=$prev_rev
    echo "no layer changes, keeping revision r$rev"
  else
    rev=$((prev_rev + 1))
    echo "layers changed, bumping to revision r$rev"
  fi

  docker tag "$image:latest" "$image:r$rev"
  docker push "$image:latest"
  docker push "$image:r$rev"

  # Saved after the push so a failed push leaves the previous id untouched and
  # the next run re-bumps until something actually lands in the registry.
  printf '%s %s\n' "$rev" "$new_id" > "$rev_file"

  echo "=== done: $image (r$rev) ==="
done

echo "=== all images built and pushed ==="
