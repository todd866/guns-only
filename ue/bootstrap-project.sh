#!/bin/bash
# Create (or refresh the text config of) the Unreal project from ue/project-template.
# The project lives outside git: ~/Documents/Unreal Projects/RCOdyssey. Idempotent.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${UE_PROJECT_DIR:-$HOME/Documents/Unreal Projects/RCOdyssey}"
ENGINE="${UE_ENGINE_DIR:-/Users/Shared/Epic Games/UE_5.8}"
EDITOR="$ENGINE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
mkdir -p "$DEST/Config" "$DEST/Content"
cp "$HERE/project-template/RCOdyssey.uproject" "$DEST/"
cp "$HERE/project-template/Config/"*.ini "$DEST/Config/"
echo "project: $DEST/RCOdyssey.uproject"
[ -x "$EDITOR" ] && echo "editor:  $EDITOR" || echo "editor:  NOT INSTALLED at $ENGINE"
cat <<USAGE
run the parity spike:
  "$EDITOR" "$DEST/RCOdyssey.uproject" -unattended -nosplash -NoSound -log \
    -ExecutePythonScript="$HERE/unreal/parity_spike.py --repo $(cd "$HERE/.." && pwd) --track housing"
USAGE
