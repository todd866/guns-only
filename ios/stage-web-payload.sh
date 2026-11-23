#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PUB_WWW="${GUNS_PUB_WWWROOT:-/tmp/guns-only-pub/wwwroot}"
RC_DIST="${GUNS_RC_DIST:-/tmp/rc-dist}"
STAGE="$HERE/Payload/wwwroot"

export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export DOTNET_MULTILEVEL_LOOKUP=0

if [ ! -f "$PUB_WWW/index.html" ]; then
  "$DOTNET_ROOT/dotnet" publish "$REPO/web/GunsOnly.Web.csproj" -c Release -o /tmp/guns-only-pub
fi

if [ ! -f "$RC_DIST/rc/index.html" ]; then
  node "$REPO/tools/rc/package-rc.mjs" --out "$RC_DIST"
fi

mkdir -p "$STAGE" "$STAGE/rc"
rsync -a --delete \
  --exclude='_framework/*.br' \
  --exclude='_framework/*.gz' \
  --exclude='/rc' \
  "$PUB_WWW/" "$STAGE/"

rsync -a --delete "$RC_DIST/rc/" "$STAGE/rc/"

# Render an opaque 1024x1024 RGB PNG icon from the canonical web icon.
ICON_DIR="$HERE/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$ICON_DIR"
TMP_ICON_DIR="$(mktemp -d /tmp/guns-ios-icon.XXXXXX)"
trap 'rm -rf "$TMP_ICON_DIR"' EXIT
sips -z 1024 1024 "$REPO/web/wwwroot/icons/icon-512.png" --out "$TMP_ICON_DIR/icon1024.png" >/dev/null
sips -s format jpeg -s formatOptions 100 "$TMP_ICON_DIR/icon1024.png" --out "$TMP_ICON_DIR/icon1024.jpg" >/dev/null
sips -s format png "$TMP_ICON_DIR/icon1024.jpg" --out "$ICON_DIR/AppIcon-1024.png" >/dev/null

du -sh "$STAGE"
