#!/bin/zsh
# Bundle the shared RC physics into one classic script for JavaScriptCore.
set -e
here=${0:A:h}; out=${1:-$here/../../../native/saucer-springs/Sources/SaucerSprings/rcsim.js}
esbuild=${ESBUILD:-$(command -v esbuild || ls ~/Projects/*/node_modules/.bin/esbuild 2>/dev/null | head -1)}
$esbuild $here/sim-entry.mjs --bundle --format=iife --target=es2022 --outfile=$out --log-level=warning
echo "bundled $(wc -c < $out) bytes -> $out"
