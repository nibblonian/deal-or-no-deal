#!/usr/bin/env bash
#
# Build the Deal or No Deal image for the QNAP (Intel/AMD, linux/amd64) and
# either push it to GitHub Container Registry or save it as a tarball.
#
# Works with podman (preferred) or docker — auto-detected.
#
# Usage:
#   GHCR_OWNER=yourname ./publish.sh            # build + push to ghcr.io (default)
#   GHCR_OWNER=yourname TAG=v2 ./publish.sh     # custom tag
#   ./publish.sh tar                            # build + save a .tar.gz to import
#
# Env overrides:
#   ENGINE       podman | docker      (default: auto-detect)
#   GHCR_OWNER   your GitHub username/org (required for the ghcr mode)
#   IMAGE_NAME   image name           (default: deal-or-no-deal)
#   TAG          image tag            (default: latest)
#   PLATFORM     target platform      (default: linux/amd64  — most QNAPs)
#   OUT          tarball path         (tar mode; default: ./<image>-<tag>-amd64.tar)
#
set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-ghcr}"
IMAGE="${IMAGE_NAME:-deal-or-no-deal}"
TAG="${TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }

# Pick a container engine. Prefer podman (incl. the installer's /opt/podman/bin
# which isn't always on a non-login shell's PATH), and only fall back to docker.
# ENGINE_BIN holds the actual binary to invoke.
find_podman() {
  command -v podman 2>/dev/null || { [ -x /opt/podman/bin/podman ] && echo /opt/podman/bin/podman; }
}

ENGINE="${ENGINE:-}"
ENGINE_BIN=""
case "$ENGINE" in
  podman) ENGINE_BIN="$(find_podman)" ;;
  docker) ENGINE_BIN="$(command -v docker 2>/dev/null || true)" ;;
  "")
    if ENGINE_BIN="$(find_podman)" && [ -n "$ENGINE_BIN" ]; then ENGINE=podman
    elif ENGINE_BIN="$(command -v docker 2>/dev/null)"; then ENGINE=docker
    fi
    ;;
esac
if [ -z "$ENGINE_BIN" ]; then
  red "Could not find the '$ENGINE' engine. Install podman/docker, or set ENGINE."
  exit 1
fi
green "Engine: $ENGINE ($ENGINE_BIN)   Platform: $PLATFORM"

# --- build helpers ------------------------------------------------------------

# extra_tags returns a git-short-sha tag suffix when in a repo, else nothing.
sha_ref() { git rev-parse --short HEAD 2>/dev/null || true; }

# build_and_push REF [REF2 ...]
build_and_push() {
  local refs=("$@")
  case "$ENGINE" in
    podman)
      local targs=(); for r in "${refs[@]}"; do targs+=(-t "$r"); done
      "$ENGINE_BIN" build --platform "$PLATFORM" "${targs[@]}" .
      for r in "${refs[@]}"; do "$ENGINE_BIN" push "$r"; done
      ;;
    docker)
      ensure_buildx
      local targs=(); for r in "${refs[@]}"; do targs+=(-t "$r"); done
      "$ENGINE_BIN" buildx build --builder "$BUILDER" --platform "$PLATFORM" "${targs[@]}" --push .
      ;;
  esac
}

# build_and_save REF OUTFILE
build_and_save() {
  local ref="$1" out="$2"
  case "$ENGINE" in
    podman)
      "$ENGINE_BIN" build --platform "$PLATFORM" -t "$ref" .
      "$ENGINE_BIN" save --format docker-archive -o "$out" "$ref"
      ;;
    docker)
      ensure_buildx
      "$ENGINE_BIN" buildx build --builder "$BUILDER" --platform "$PLATFORM" -t "$ref" \
        --output "type=docker,dest=${out}" .
      ;;
  esac
}

# docker-only: a container-driver builder can cross-build + push/save.
BUILDER="dond-builder"
ensure_buildx() {
  if ! "$ENGINE_BIN" buildx inspect "$BUILDER" >/dev/null 2>&1; then
    green "Creating buildx builder '$BUILDER' (first run only)…"
    "$ENGINE_BIN" buildx create --name "$BUILDER" --driver docker-container >/dev/null
  fi
}

# --- modes --------------------------------------------------------------------

case "$MODE" in
  ghcr)
    if [ -z "${GHCR_OWNER:-}" ]; then
      red "GHCR_OWNER is required. Example: GHCR_OWNER=yourname ./publish.sh"
      exit 1
    fi
    OWNER="$(printf '%s' "$GHCR_OWNER" | tr '[:upper:]' '[:lower:]')" # ghcr wants lowercase
    REF="ghcr.io/${OWNER}/${IMAGE}:${TAG}"
    REFS=("$REF")
    if SHA="$(sha_ref)" && [ -n "$SHA" ]; then
      REFS+=("ghcr.io/${OWNER}/${IMAGE}:${SHA}")
    fi

    green "Building and pushing ${REF} …"
    if ! build_and_push "${REFS[@]}"; then
      red "Push failed. If it's an auth error, log in first:"
      echo "    echo \$CR_PAT | ${ENGINE_BIN} login ghcr.io -u ${OWNER} --password-stdin"
      echo "  (CR_PAT = a GitHub token with 'write:packages')"
      exit 1
    fi

    green "Done. On the QNAP, pull it in Container Station (or CLI):"
    echo "    docker pull ${REF}"
    echo
    echo "If the package is private, log in on the NAS the same way, or make it"
    echo "public at github.com/users/${OWNER}/packages."
    ;;

  tar)
    REF="${IMAGE}:${TAG}"
    OUT="${OUT:-./${IMAGE}-${TAG}-amd64.tar}"
    green "Building and saving ${REF} to ${OUT} …"
    build_and_save "$REF" "$OUT"
    gzip -f "$OUT"
    green "Done: ${OUT}.gz"
    echo "On the QNAP: Container Station → Images → Import (choose this file),"
    echo "or via CLI:  docker load -i ${IMAGE}-${TAG}-amd64.tar.gz"
    ;;

  *)
    red "Unknown mode '$MODE'. Use 'ghcr' (default) or 'tar'."
    exit 1
    ;;
esac
