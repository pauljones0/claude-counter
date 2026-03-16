#!/usr/bin/env bash
# build.sh — Package Claude Counter for Chrome Web Store (.zip) and Firefox AMO (.xpi)
#
# Usage:
#   ./build.sh          Build both Chrome and Firefox packages
#   ./build.sh chrome   Build Chrome package only
#   ./build.sh firefox  Build Firefox package only
#
# Output:
#   dist/claude-counter-<version>-chrome.zip
#   dist/claude-counter-<version>-firefox.xpi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Read version from the shared manifest
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$VERSION" ]; then
  echo "Error: Could not read version from manifest.json"
  exit 1
fi

echo "Building Claude Counter v${VERSION}"

DIST_DIR="dist"
mkdir -p "$DIST_DIR"

# Files common to both builds
COMMON_FILES=(
  icons/icon.png
  icons/icon128.png
  icons/icon16.png
  icons/icon256.png
  icons/icon32.png
  icons/icon48.png
  icons/icon96.png
  src/content/bridge-client.js
  src/content/constants.js
  src/content/main.js
  src/content/tokens.js
  src/content/ui.js
  src/injected/bridge.js
  src/styles.css
  src/vendor/o200k_base.js
  LICENSE
)

# Use zip if available, otherwise fall back to PowerShell (Windows)
create_archive() {
  local staging_dir="$1"
  local output_path="$2"

  if command -v zip &>/dev/null; then
    (cd "$staging_dir" && zip -r -q "$(cd "$SCRIPT_DIR" && pwd)/$output_path" .)
  else
    # Windows fallback using PowerShell
    local abs_staging
    abs_staging=$(cd "$staging_dir" && pwd -W 2>/dev/null || pwd)
    local abs_output
    abs_output="$(cd "$SCRIPT_DIR" && pwd -W 2>/dev/null || pwd)/$output_path"
    powershell.exe -NoProfile -Command "Compress-Archive -Path '${abs_staging}\\*' -DestinationPath '${abs_output}' -Force"
  fi
}

build_chrome() {
  local OUT="${DIST_DIR}/claude-counter-${VERSION}-chrome.zip"
  local STAGING="${DIST_DIR}/_chrome_staging"

  echo "  Packaging Chrome extension..."
  rm -rf "$STAGING"
  mkdir -p "$STAGING"

  for f in "${COMMON_FILES[@]}"; do
    mkdir -p "$STAGING/$(dirname "$f")"
    cp "$f" "$STAGING/$f"
  done

  # Use Chrome-specific manifest (no gecko settings)
  cp manifest_chrome.json "$STAGING/manifest.json"

  rm -f "$OUT"
  create_archive "$STAGING" "$OUT"

  rm -rf "$STAGING"
  echo "  -> $OUT"
}

build_firefox() {
  local OUT="${DIST_DIR}/claude-counter-${VERSION}-firefox.xpi"
  local STAGING="${DIST_DIR}/_firefox_staging"

  echo "  Packaging Firefox extension..."
  rm -rf "$STAGING"
  mkdir -p "$STAGING"

  for f in "${COMMON_FILES[@]}"; do
    mkdir -p "$STAGING/$(dirname "$f")"
    cp "$f" "$STAGING/$f"
  done

  # Use Firefox-specific manifest (with gecko settings)
  cp manifest_firefox.json "$STAGING/manifest.json"

  # Firefox .xpi is just a zip with a different extension
  rm -f "$OUT"
  create_archive "$STAGING" "${OUT%.xpi}.zip"
  mv "${OUT%.xpi}.zip" "$OUT"

  rm -rf "$STAGING"
  echo "  -> $OUT"
}

TARGET="${1:-all}"

case "$TARGET" in
  chrome)
    build_chrome
    ;;
  firefox)
    build_firefox
    ;;
  all)
    build_chrome
    build_firefox
    ;;
  *)
    echo "Usage: $0 [chrome|firefox|all]"
    exit 1
    ;;
esac

echo "Done!"
