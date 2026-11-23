#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DEST="${UE_PROJECT_DIR:-/Users/iantodd/Projects/guns-only-ue}"
ENGINE="${UE_ENGINE_DIR:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR="$ENGINE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"

# Build the NativeAOT macOS shared library and run the C ABI verification test first.
"$REPO/sim-native/build-native.sh" --test

mkdir -p \
  "$DEST/Config" \
  "$DEST/Content" \
  "$DEST/Source/GunsOnlyUE" \
  "$DEST/ThirdParty/GunsOnlySim/include" \
  "$DEST/Binaries/ThirdParty/GunsOnlySim/Mac"

cp "$HERE/GunsOnlyUE.uproject" "$DEST/"
cp "$HERE/Config/"*.ini "$DEST/Config/"
cp -R "$HERE/Source/" "$DEST/Source/"
cp "$REPO/sim-native/include/guns_only_sim.h" "$DEST/ThirdParty/GunsOnlySim/include/"
cp "$REPO/sim-native/out/osx-arm64/libGunsOnlySim.dylib" "$DEST/Binaries/ThirdParty/GunsOnlySim/Mac/"

if [ -f "$REPO/sim-native/out/ios-arm64/libGunsOnlySim.a" ]; then
  mkdir -p "$DEST/ThirdParty/GunsOnlySim/lib/ios-arm64"
  cp "$REPO/sim-native/out/ios-arm64/libGunsOnlySim.a" "$DEST/ThirdParty/GunsOnlySim/lib/ios-arm64/"
fi

echo "project: $DEST/GunsOnlyUE.uproject"
[ -x "$EDITOR" ] && echo "editor:  $EDITOR" || echo "editor:  NOT INSTALLED at $ENGINE"
cat <<USAGE
Build Editor target:
  heavy-slot -- "$ENGINE/Engine/Build/BatchFiles/Mac/Build.sh" GunsOnlyUEEditor Mac Development -project="$DEST/GunsOnlyUE.uproject" -progress
Run headless Automation Test:
  "$ENGINE/Engine/Binaries/Mac/UnrealEditor-Cmd" "$DEST/GunsOnlyUE.uproject" -ExecCmds="Automation RunTests GunsOnly.NativeBridge.FlightAndRtb; Quit" -unattended -nop4 -nosplash -NullRHI -NoSound -TestExit="Automation Test Queue Empty"
Build Standalone Mac Game target:
  heavy-slot -- "$ENGINE/Engine/Build/BatchFiles/Mac/Build.sh" GunsOnlyUE Mac Development -project="$DEST/GunsOnlyUE.uproject" -progress
Launch Game Standalone (-game):
  "$EDITOR" "$DEST/GunsOnlyUE.uproject" -game -WINDOWED -ResX=1280 -ResY=720 -NoSound
USAGE
