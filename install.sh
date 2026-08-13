#!/usr/bin/env bash
# Install myket into your home directory (no sudo / no admin).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/asideofcode/myket/main/install.sh | bash
#   wget -qO- https://raw.githubusercontent.com/asideofcode/myket/main/install.sh | bash
set -euo pipefail

REPO="asideofcode/myket"
API="https://api.github.com/repos/${REPO}/releases/latest"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "myket: need '$1' on PATH" >&2
    exit 1
  }
}

need curl
need uname
need python3

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64|aarch64) ARCH_KEY="arm64" ;;
  x86_64|amd64) ARCH_KEY="x64" ;;
  *)
    echo "myket: unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH_KEY" = "arm64" ]; then
    ASSET_RE='myket_aarch64\.app\.tar\.gz'
  else
    ASSET_RE='myket_x64\.app\.tar\.gz'
  fi
elif [ "$OS" = "Linux" ]; then
  ASSET_RE='myket_.*_amd64\.AppImage'
else
  echo "myket: this script supports macOS and Linux." >&2
  echo "For Windows, download the setup exe from:" >&2
  echo "  https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

echo "myket: fetching latest release..."
JSON="$(curl -fsSL -A 'myket-install' "$API")"

# Single python pass -> ASSET_URL + ASSET_FILE (avoids fragile line-splitting / unset vars)
EVAL="$(
  printf '%s' "$JSON" | RE="$ASSET_RE" python3 -c '
import json, os, re, shlex, sys
data = json.load(sys.stdin)
pat = re.compile(os.environ["RE"])
for a in data.get("assets") or []:
    name = a.get("name") or ""
    url = a.get("browser_download_url") or ""
    if pat.search(name) and url:
        print("ASSET_URL=" + shlex.quote(url))
        print("ASSET_FILE=" + shlex.quote(name))
        sys.exit(0)
sys.stderr.write("myket: no matching asset in latest release\n")
sys.exit(1)
'
)"

ASSET_URL=""
ASSET_FILE=""
eval "$EVAL"

if [ -z "${ASSET_URL}" ] || [ -z "${ASSET_FILE}" ]; then
  echo "myket: could not resolve download for $OS/$ARCH_KEY" >&2
  echo "Check https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "myket: downloading ${ASSET_FILE}..."
curl -fL --progress-bar -o "${TMP}/${ASSET_FILE}" "$ASSET_URL"

if [ "$OS" = "Darwin" ]; then
  need tar
  DEST_DIR="${HOME}/Applications"
  mkdir -p "$DEST_DIR"
  rm -rf "${DEST_DIR}/myket.app"
  tar -xzf "${TMP}/${ASSET_FILE}" -C "$DEST_DIR"
  if [ ! -d "${DEST_DIR}/myket.app" ]; then
    FOUND="$(find "$DEST_DIR" -maxdepth 2 -type d -name 'myket.app' 2>/dev/null | head -1 || true)"
    if [ -n "${FOUND}" ] && [ "$FOUND" != "${DEST_DIR}/myket.app" ]; then
      mv "$FOUND" "${DEST_DIR}/myket.app"
    fi
  fi
  if [ ! -d "${DEST_DIR}/myket.app" ]; then
    echo "myket: extract failed — myket.app not found in archive" >&2
    exit 1
  fi
  if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "${DEST_DIR}/myket.app" 2>/dev/null || true
  fi
  echo
  echo "myket installed to ${DEST_DIR}/myket.app"
  echo "Open it with:"
  echo "  open ${DEST_DIR}/myket.app"
  echo "If macOS blocks it: right-click the app -> Open"
else
  DEST_DIR="${HOME}/.local/bin"
  mkdir -p "$DEST_DIR"
  install -m 755 "${TMP}/${ASSET_FILE}" "${DEST_DIR}/myket"
  echo
  echo "myket installed to ${DEST_DIR}/myket"
  echo "Run:"
  echo "  myket"
  case ":${PATH}:" in
    *":${DEST_DIR}:"*) ;;
    *)
      echo
      echo "Note: add ${DEST_DIR} to your PATH, e.g.:"
      echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
      ;;
  esac
fi
