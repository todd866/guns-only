#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
UE_PROJ="${UE_PROJECT_DIR:-/Users/iantodd/Projects/guns-only-ue}"
UE_ENG="${UE_ENGINE_DIR:-/Users/Shared/Epic Games/UE_5.8}"
QA_DIR="$UE_PROJ/Saved/QaShots"
LOG_DIR="$UE_PROJ/Saved/Logs"

SKIP_BLENDER=0
for arg in "$@"; do
  case "$arg" in
    --skip-blender) SKIP_BLENDER=1 ;;
    *) echo "usage: $0 [--skip-blender]" >&2; exit 2 ;;
  esac
done

mkdir -p "$LOG_DIR"
if [ -d "$QA_DIR" ]; then
  trash "$QA_DIR"
fi
mkdir -p "$QA_DIR"

if [ "$SKIP_BLENDER" -eq 0 ]; then
  echo "=== [1/6] Blender FBX Asset Build ==="
  /opt/homebrew/bin/blender -b --python "$HERE/Assets/scripts/build_ue_assets.py"
fi

echo "=== [2/6] NativeAOT Build + C ABI v4 Test + Sync to UE Project ==="
"$HERE/bootstrap-ue.sh"

echo "=== [3/6] Build GunsOnlyUEEditor (Mac Development) ==="
"$UE_ENG/Engine/Build/BatchFiles/Mac/Build.sh" \
  GunsOnlyUEEditor Mac Development \
  -project="$UE_PROJ/GunsOnlyUE.uproject" -progress

echo "=== [4/6] Import Assets & Build M_Volumetric_Clouds in UE 5.8 ==="
"$UE_ENG/Engine/Binaries/Mac/UnrealEditor-Cmd" "$UE_PROJ/GunsOnlyUE.uproject" \
  -ExecutePythonScript="$UE_PROJ/Assets/scripts/import_to_ue.py" \
  -unattended -nop4 -nosplash -NullRHI -NoSound \
  -abslog="$LOG_DIR/import_to_ue.log"

echo "=== [5/6] Run UE Automation Tests (GunsOnly.) ==="
"$UE_ENG/Engine/Binaries/Mac/UnrealEditor-Cmd" "$UE_PROJ/GunsOnlyUE.uproject" \
  -ExecCmds="Automation RunTests GunsOnly.; Quit" \
  -unattended -nop4 -nosplash -NullRHI -NoSound \
  -TestExit="Automation Test Queue Empty" \
  -abslog="$LOG_DIR/automation_tests.log"

echo "=== [6/6] Capture 7 Real Metal GPU Offscreen QA Shots ==="
"$UE_ENG/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$UE_PROJ/GunsOnlyUE.uproject" \
  -game -RenderOffScreen -ResX=1280 -ResY=720 -NoSound -unattended -nop4 -nosplash \
  -GunsQaShots="$QA_DIR" \
  -abslog="$LOG_DIR/qa_capture.log"

ls -lh "$QA_DIR"
