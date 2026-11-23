#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

DEST="generic/platform=iOS"
INSTALL_UDID=""
if [ "${1:-}" = "--install" ]; then
  INSTALL_UDID="${2:-00008130-001241063003401C}"
  DEST="id=$INSTALL_UDID"
fi

./stage-web-payload.sh
xcodegen generate

xcodebuild \
  -project "$HERE/GunsOnlyiOS.xcodeproj" \
  -scheme GunsOnlyiOS \
  -configuration Release \
  -destination "$DEST" \
  -derivedDataPath "$HERE/build/DeviceDerivedData" \
  -allowProvisioningUpdates \
  clean build

APP_PATH="$HERE/build/DeviceDerivedData/Build/Products/Release-iphoneos/GunsOnlyiOS.app"
codesign --verify --deep --strict "$APP_PATH"
echo "signed app: $APP_PATH"
if [ -n "$INSTALL_UDID" ]; then
  xcrun devicectl device install app --device "$INSTALL_UDID" "$APP_PATH"
else
  echo "install cmd: xcrun devicectl device install app --device 00008130-001241063003401C \"$APP_PATH\""
fi
