#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RID="osx-arm64"
RUN_TEST=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --rid)
      RID="${2:?missing rid}"
      shift 2
      ;;
    --test)
      RUN_TEST=1
      shift
      ;;
    *)
      echo "usage: $0 [--rid osx-arm64|ios-arm64] [--test]" >&2
      exit 2
      ;;
  esac
done

export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export DOTNET_MULTILEVEL_LOOKUP=0

"$DOTNET_ROOT/dotnet" publish "$HERE/GunsOnly.Sim.Native.csproj" \
  -c Release \
  -r "$RID"

PUB_DIR="$HERE/bin/Release/net8.0/$RID/publish"
OUT_DIR="$HERE/out/$RID"
mkdir -p "$OUT_DIR"

if [ "$RID" = "ios-arm64" ]; then
  cp "$PUB_DIR/GunsOnlySim.a" "$OUT_DIR/libGunsOnlySim.a"
  echo "built: $OUT_DIR/libGunsOnlySim.a"
else
  cp "$PUB_DIR/GunsOnlySim.dylib" "$OUT_DIR/libGunsOnlySim.dylib"
  install_name_tool -id "@rpath/libGunsOnlySim.dylib" "$OUT_DIR/libGunsOnlySim.dylib"
  echo "built: $OUT_DIR/libGunsOnlySim.dylib"
  if [ "$RUN_TEST" -eq 1 ]; then
    TMP_DIR="$(mktemp -d /tmp/guns-sim-abi.XXXXXX)"
    TMP_BIN="$TMP_DIR/test_c_abi"
    trap 'rm -rf "$TMP_DIR"' EXIT
    clang -std=c11 -Wall -Wextra -Werror \
      -I"$HERE/include" \
      "$HERE/tests/test_c_abi.c" \
      "$OUT_DIR/libGunsOnlySim.dylib" \
      -Wl,-rpath,"$OUT_DIR" \
      -lm \
      -o "$TMP_BIN"
    "$TMP_BIN"
  fi
fi
