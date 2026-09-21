#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUNNER_OS:-}" != Linux || "${RUNNER_ARCH:-}" != X64 ]]; then
  echo "The Fintoc CLI release supports Linux X64 GitHub runners." >&2
  exit 1
fi
if [[ ! "${OPENCODE_RELEASE_REPOSITORY:-}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "Set release_repository to the fork's owner/repo." >&2
  exit 1
fi
if [[ ! "${OPENCODE_RELEASE_VERSION:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-fintoc\.[0-9]+$ ]]; then
  echo "Expected an explicit Fintoc CLI version." >&2
  exit 1
fi

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT
gh release download "v$OPENCODE_RELEASE_VERSION" \
  --repo "$OPENCODE_RELEASE_REPOSITORY" \
  --pattern opencode-linux-x64.tar.gz \
  --pattern SHA256SUMS \
  --dir "$download_dir"
(
  cd "$download_dir"
  sha256sum --check SHA256SUMS
  tar -xzf opencode-linux-x64.tar.gz opencode
)
install_dir=${OPENCODE_INSTALL_DIR:-"$HOME/.opencode/bin"}
install -d "$install_dir"
install -m 755 "$download_dir/opencode" "$install_dir/opencode"
