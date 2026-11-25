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

export DOTNET_MULTILEVEL_LOOKUP=0

OUT_DIR="$HERE/out/$RID"
mkdir -p "$OUT_DIR"

if [ "$RID" = "ios-arm64" ]; then
  DOTNET_IOS="${DOTNET_IOS:-/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/ThirdParty/DotNet/10.0/mac-arm64/dotnet}"
  if [ ! -x "$DOTNET_IOS" ]; then
    DOTNET_IOS="${DOTNET_ROOT:-$HOME/.dotnet}/dotnet"
  fi
  export DOTNET_ROOT="$(cd "$(dirname "$DOTNET_IOS")" && pwd)"

  PUB_DIR="$HERE/bin/Release/net10.0/$RID/publish"
  RAW_ARCHIVE="$PUB_DIR/GunsOnlySim.a"
  if [ "${REPACK_ONLY:-0}" -eq 0 ] || [ ! -f "$RAW_ARCHIVE" ]; then
    "$DOTNET_IOS" publish "$HERE/GunsOnly.Sim.Native.csproj" \
      -c Release \
      -r "$RID"
  fi

  if [ ! -f "$RAW_ARCHIVE" ]; then
    RAW_ARCHIVE="$PUB_DIR/libGunsOnlySim.a"
  fi
  if [ ! -f "$RAW_ARCHIVE" ]; then
    echo "missing ios NativeAOT output under $PUB_DIR" >&2
    exit 1
  fi

  RUNTIME_DIR="$(ls -d "$HOME/.nuget/packages/microsoft.netcore.app.runtime.nativeaot.ios-arm64/"*/runtimes/ios-arm64/native 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -z "$RUNTIME_DIR" ] && [ -d "$HOME/.nuget/packages" ]; then
    RUNTIME_DIR="$(find "$HOME/.nuget/packages" -maxdepth 4 -type d -path "*nativeaot.ios-arm64*/runtimes/ios-arm64/native" | sort -V | tail -n 1 || true)"
  fi
  if [ -z "$RUNTIME_DIR" ] || [ ! -d "$RUNTIME_DIR" ]; then
    echo "NativeAOT ios-arm64 runtime pack native directory not found in ~/.nuget/packages" >&2
    exit 1
  fi
  if [ -f "$RUNTIME_DIR/libbootstrapperdll.o" ]; then
    cp "$RUNTIME_DIR/libbootstrapperdll.o" "$OUT_DIR/libbootstrapperdll.o"
  fi

  if nm -gU "$RAW_ARCHIVE" 2>/dev/null | grep -q "RhpNewFast"; then
    cp "$RAW_ARCHIVE" "$OUT_DIR/libGunsOnlySim.a"
  else
    # Merge GunsOnlySim object archive + .NET 10 NativeAOT ios-arm64 runtime libraries into one self-contained libGunsOnlySim.a
    MERGE_LIBS=("$RAW_ARCHIVE")
    for candidate in \
      "$RUNTIME_DIR/libRuntime.WorkstationGC.a" \
      "$RUNTIME_DIR/libRuntime.VxSortDisabled.a" \
      "$RUNTIME_DIR/libeventpipe-disabled.a" \
      "$RUNTIME_DIR/libstandalonegc-disabled.a" \
      "$RUNTIME_DIR/libstdc++compat.a" \
      "$RUNTIME_DIR/libaotminipal.a" \
      "$RUNTIME_DIR/libbrotlicommon.a" \
      "$RUNTIME_DIR/libbrotlidec.a" \
      "$RUNTIME_DIR/libbrotlienc.a" \
      "$RUNTIME_DIR/libSystem.Native.a" \
      "$RUNTIME_DIR/libSystem.IO.Compression.Native.a" \
      "$RUNTIME_DIR/libSystem.Net.Security.Native.a" \
      "$RUNTIME_DIR/libSystem.Security.Cryptography.Native.Apple.a"; do
      if [ -f "$candidate" ]; then
        MERGE_LIBS+=("$candidate")
      fi
    done
    # Prefer VxSortEnabled if present instead of Disabled, or keep only one if both exist
    if [ -f "$RUNTIME_DIR/libRuntime.VxSortEnabled.a" ] && [ ! -f "$RUNTIME_DIR/libRuntime.VxSortDisabled.a" ]; then
      MERGE_LIBS+=("$RUNTIME_DIR/libRuntime.VxSortEnabled.a")
    fi
    xcrun libtool -static -o "$OUT_DIR/libGunsOnlySim.a" "${MERGE_LIBS[@]}"
  fi
  echo "built: $OUT_DIR/libGunsOnlySim.a"
else
  export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
  "$DOTNET_ROOT/dotnet" publish "$HERE/GunsOnly.Sim.Native.csproj" \
    -c Release \
    -r "$RID"
  PUB_DIR="$HERE/bin/Release/net8.0/$RID/publish"
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
