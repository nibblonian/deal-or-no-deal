#!/usr/bin/env bash
#
# Build the Deal or No Deal image for the QNAP (Intel/AMD, linux/amd64) and
# either push it to GitHub Container Registry or save it as a tarball.
#
# Usage:
#   GHCR_OWNER=yourname ./publish.sh            # build + push to ghcr.io (default)
#   GHCR_OWNER=yourname TAG=v2 ./publish.sh     # custom tag
#   ./publish.sh tar                            # build + save a .tar.gz to import
#
# Env overrides:
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

# A container-driver buildx builder can cross-build amd64 from an Apple-Silicon
# Mac and emit either a pushed image or a loadable tarball.
BUILDER="dond-builder"
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  green "Creating buildx builder '$BUILDER' (first run only)…"
  docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
fi
BUILDX=(docker buildx build --builder "$BUILDER" --platform "$PLATFORM")

case "$MODE" in
  ghcr)
    if [ -z "${GHCR_OWNER:-}" ]; then
      red "GHCR_OWNER is required. Example: GHCR_OWNER=yourname ./publish.sh"
      exit 1
    fi
    OWNER="$(printf '%s' "$GHCR_OWNER" | tr '[:upper:]' '[:lower:]')" # ghcr wants lowercase
    REF="ghcr.io/${OWNER}/${IMAGE}:${TAG}"
    TAGS=(-t "$REF")
    if SHA="$(git rev-parse --short HEAD 2>/dev/null)"; then
      TAGS+=(-t "ghcr.io/${OWNER}/${IMAGE}:${SHA}")
    fi

    green "Building and pushing ${REF} (${PLATFORM})…"
    if ! "${BUILDX[@]}" "${TAGS[@]}" --push .; then
      red "Push failed. If it's an auth error, log in first:"
      echo "    echo \$CR_PAT | docker login ghcr.io -u ${OWNER} --password-stdin"
      echo "  (CR_PAT = a GitHub token with 'write:packages')"
      exit 1
    fi

    green "Done. On the QNAP, pull it in Container Station (or CLI):"
    echo "    docker pull ${REF}"
    echo
    echo "If the package is private, first log in on the NAS the same way, or"
    echo "make the package public at github.com/users/${OWNER}/packages."
    ;;

  tar)
    REF="${IMAGE}:${TAG}"
    OUT="${OUT:-./${IMAGE}-${TAG}-amd64.tar}"
    green "Building and saving ${REF} (${PLATFORM}) to ${OUT}…"
    "${BUILDX[@]}" -t "$REF" --output "type=docker,dest=${OUT}" .
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
