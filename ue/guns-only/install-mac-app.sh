#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DEST="${UE_PROJECT_DIR:-/Users/iantodd/Projects/guns-only-ue}"
ENGINE="${UE_ENGINE_DIR:-/Users/Shared/Epic Games/UE_5.8}"
ICON_SRC="$REPO/ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
ARCHIVE_DIR="$DEST/Saved/PackagedMac"
APP_NAME="Guns Only.app"
INSTALL_APP="/Applications/$APP_NAME"
SIGN_ID="${MAC_SIGN_IDENTITY:-Developer ID Application: Ian Todd (U87MQBZKJ5)}"

STAGE_ONLY=0
SKIP_COOK=0
RUN_SMOKE=0
for arg in "$@"; do
  case "$arg" in
    --stage-only) STAGE_ONLY=1 ;;
    --skip-cook) SKIP_COOK=1 ;;
    --smoke) RUN_SMOKE=1 ;;
    *) echo "usage: $0 [--stage-only] [--skip-cook] [--smoke]" >&2; exit 2 ;;
  esac
done

mkdir -p "$DEST/Saved/Logs"

if [ "$STAGE_ONLY" -eq 0 ]; then
  if [ "$SKIP_COOK" -eq 0 ]; then
    # 1. Build NativeAOT macOS dylib + run C ABI test, and sync Source/Config/Assets to UE project.
    "$HERE/bootstrap-ue.sh"

    # 2. Build Editor target so UAT Cook and UnrealEditor-Cmd load our latest C++ changes.
    "$ENGINE/Engine/Build/BatchFiles/Mac/Build.sh" \
      GunsOnlyUEEditor Mac Development \
      -project="$DEST/GunsOnlyUE.uproject" -progress

    # 3. Ensure textures, PBR materials, StaticMeshes, and /Game/GunsOnly/Maps/GunsOnlyMain exist.
    "$ENGINE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$DEST/GunsOnlyUE.uproject" \
      -ExecutePythonScript="$DEST/Assets/scripts/import_to_ue.py" \
      -unattended -nop4 -nosplash -NullRHI -NoSound

    UAT_BUILD_COOK_FLAGS=(-cook -build)
  else
    UAT_BUILD_COOK_FLAGS=(-skipbuild -skipcook)
  fi

  # 4. Cook (unless --skip-cook), build, stage, pak, and archive standalone macOS client bundle.
  if [ -d "$ARCHIVE_DIR" ]; then
    trash "$ARCHIVE_DIR"
  fi
  mkdir -p "$ARCHIVE_DIR"

  UAT_LOG="$DEST/Saved/Logs/uat_package.log"
  if ! "$ENGINE/Engine/Build/BatchFiles/RunUAT.sh" BuildCookRun \
    -project="$DEST/GunsOnlyUE.uproject" \
    -noP4 \
    -platform=Mac \
    -clientconfig=Development \
    "${UAT_BUILD_COOK_FLAGS[@]}" \
    -stage \
    -pak \
    -archive \
    -archivedirectory="$ARCHIVE_DIR" \
    -unattended \
    -utf8output \
    </dev/null >"$UAT_LOG" 2>&1; then
    echo "install-mac-app: RunUAT BuildCookRun failed; last 40 lines of $UAT_LOG:" >&2
    tail -n 40 "$UAT_LOG" >&2 || true
    exit 1
  fi
  tail -n 15 "$UAT_LOG" || true
fi

RAW_APP="$DEST/Saved/StagedBuilds/Mac/GunsOnlyUE.app"
if [ ! -d "$RAW_APP" ]; then
  RAW_APP="$(find "$ARCHIVE_DIR" -maxdepth 4 -type d -name "*.app" | head -n 1)"
fi
if [ -z "$RAW_APP" ] || [ ! -d "$RAW_APP" ]; then
  echo "install-mac-app: packaged .app not found in Saved/StagedBuilds/Mac or $ARCHIVE_DIR" >&2
  exit 1
fi
echo "Packaged raw app: $RAW_APP"

STAGED_DIR="$ARCHIVE_DIR/Staged"
STAGED_APP="$STAGED_DIR/$APP_NAME"
if [ -d "$STAGED_APP" ]; then
  trash "$STAGED_APP"
fi
mkdir -p "$STAGED_DIR"
ditto "$RAW_APP" "$STAGED_APP"

# 5. Embed libGunsOnlySim.dylib beside executable (and in ThirdParty lookup path).
DYLIB_SRC="$DEST/Binaries/ThirdParty/GunsOnlySim/Mac/libGunsOnlySim.dylib"
cp "$DYLIB_SRC" "$STAGED_APP/Contents/MacOS/libGunsOnlySim.dylib"
chmod 755 "$STAGED_APP/Contents/MacOS/libGunsOnlySim.dylib"
if [ -d "$STAGED_APP/Contents/UE/GunsOnlyUE" ]; then
  mkdir -p "$STAGED_APP/Contents/UE/GunsOnlyUE/Binaries/ThirdParty/GunsOnlySim/Mac"
  cp "$DYLIB_SRC" "$STAGED_APP/Contents/UE/GunsOnlyUE/Binaries/ThirdParty/GunsOnlySim/Mac/libGunsOnlySim.dylib"
fi

# 6. Build macOS AppIcon.icns from the 1024px master artwork and brand Info.plist.
if [ -f "$ICON_SRC" ]; then
  ICONSET_DIR="/tmp/guns-only-mac.iconset"
  if [ -d "$ICONSET_DIR" ]; then
    trash "$ICONSET_DIR"
  fi
  mkdir -p "$ICONSET_DIR"
  for sz in 16 32 128 256 512; do
    sips -z "$sz" "$sz" "$ICON_SRC" --out "$ICONSET_DIR/icon_${sz}x${sz}.png" >/dev/null
    dbl=$((sz * 2))
    sips -z "$dbl" "$dbl" "$ICON_SRC" --out "$ICONSET_DIR/icon_${sz}x${sz}@2x.png" >/dev/null
  done
  mkdir -p "$STAGED_APP/Contents/Resources"
  iconutil -c icns "$ICONSET_DIR" -o "$STAGED_APP/Contents/Resources/AppIcon.icns"
  trash "$ICONSET_DIR"
fi

INFO_PLIST="$STAGED_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :CFBundleDisplayName" "$INFO_PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Guns Only" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Guns Only" "$INFO_PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :CFBundleName string Guns Only" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon" "$INFO_PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.iantodd.gunsonly.mac" "$INFO_PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.iantodd.gunsonly.mac" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Delete :NSHighResolutionCapable" "$INFO_PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSHighResolutionCapable bool true" "$INFO_PLIST"

# 7. Inside-out Developer ID codesign so macOS Finder launches with zero warnings.
while IFS= read -r -d '' bin; do
  codesign --force --sign "$SIGN_ID" --timestamp=none "$bin" >/dev/null 2>&1 || true
done < <(find "$STAGED_APP/Contents" -type f \( -name "*.dylib" -o -name "*.so" \) -print0)

while IFS= read -r -d '' nested; do
  codesign --force --sign "$SIGN_ID" --timestamp=none "$nested" >/dev/null 2>&1 || true
done < <(find "$STAGED_APP/Contents" -depth -type d \( -name "*.framework" -o -name "*.app" \) -print0)

if [ -d "$STAGED_APP/Contents/MacOS" ]; then
  while IFS= read -r -d '' exe; do
    codesign --force --sign "$SIGN_ID" --timestamp=none "$exe"
  done < <(find "$STAGED_APP/Contents/MacOS" -maxdepth 1 -type f -perm +111 -print0)
fi

codesign --force --sign "$SIGN_ID" --timestamp=none "$STAGED_APP"
codesign --verify --deep --strict "$STAGED_APP"

# 8. Install into /Applications/Guns Only.app (trash any older copy, never rm).
if [ -e "$INSTALL_APP" ]; then
  trash "$INSTALL_APP"
fi
ditto "$STAGED_APP" "$INSTALL_APP"
codesign --verify --deep --strict "$INSTALL_APP"

echo "Installed verified macOS app: $INSTALL_APP"

if [ "$RUN_SMOKE" -eq 1 ]; then
  PKG_QA="$DEST/Saved/PkgQaShots"
  mkdir -p "$DEST/Saved/Logs"
  if [ -d "$PKG_QA" ]; then
    trash "$PKG_QA"
  fi
  mkdir -p "$PKG_QA"
  APP_EXE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INSTALL_APP/Contents/Info.plist" 2>/dev/null || echo GunsOnlyUE)"
  "$INSTALL_APP/Contents/MacOS/$APP_EXE" \
    -RenderOffScreen -ResX=1280 -ResY=720 -NoSound -unattended \
    -GunsQaShots="$PKG_QA" \
    -abslog="$DEST/Saved/Logs/pkg_smoke.log"
  ls -lh "$PKG_QA"
fi
