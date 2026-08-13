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

echo "myket: fetching latest release…"
JSON="$(curl -fsSL "$API")"

pick_url() {
  re="$1"
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$JSON" | RE="$re" python3 -c '
import json, os, re, sys
data = json.load(sys.stdin)
pat = re.compile(os.environ["RE"])
for a in data.get("assets", []):
    name = a.get("name") or ""
    if pat.search(name):
        print(a["browser_download_url"])
        print(name)
        sys.exit(0)
sys.exit(1)
'
  else
    need jq
    printf '%s' "$JSON" | jq -r --arg re "$re" '
      .assets[] | select(.name | test($re)) | .browser_download_url, .name
    ' | head -2
  fi
}

PICK_OUT="$(pick_url "$ASSET_RE")" || {
  echo "myket: could not find a matching release asset for $OS/$ARCH_KEY." >&2
  echo "Check https://github.com/${REPO}/releases/latest" >&2
  exit 1
}

URL="$(printf '%s\n' "$PICK_OUT" | sed -n '1p')"
NAME="$(printf '%s\n' "$PICK_OUT" | sed -n '2p')"

if [ -z "$URL" ] || [ -z "$NAME" ]; then
  echo "myket: could not parse release asset." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "myket: downloading $NAME…"
curl -fL --progress-bar -o "$TMP/$NAME" "$URL"

if [ "$OS" = "Darwin" ]; then
  need tar
  DEST_DIR="${HOME}/Applications"
  mkdir -p "$DEST_DIR"
  rm -rf "${DEST_DIR}/myket.app"
  tar -xzf "$TMP/$NAME" -C "$DEST_DIR"
  if [ ! -d "${DEST_DIR}/myket.app" ]; then
    FOUND="$(find "$DEST_DIR" -maxdepth 2 -type d -name 'myket.app' | head -1 || true)"
    if [ -n "${FOUND:-}" ] && [ "$FOUND" != "${DEST_DIR}/myket.app" ]; then
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
  echo "If macOS blocks it: right-click the app → Open"
else
  DEST_DIR="${HOME}/.local/bin"
  mkdir -p "$DEST_DIR"
  install -m 755 "$TMP/$NAME" "${DEST_DIR}/myket"
  echo
  echo "myket installed to ${DEST_DIR}/myket"
  echo "Run:"
  echo "  myket"
  case ":$PATH:" in
    *":${DEST_DIR}:"*) ;;
    *)
      echo
      echo "Note: add ${DEST_DIR} to your PATH, e.g.:"
      echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
      ;;
  esac
fi
