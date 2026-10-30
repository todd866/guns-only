#!/bin/zsh
# The app's frame-rate gate (owner, 2026-10-30: "it's basically unplayable"): the installed app and
# headless Chrome run the same packaged game, window and scripted drive back to back. Fails if the
# app's p95 frame time is over 33 ms (the website's release threshold).
# Usage: tools/rc/native/check-app-frames.sh [WxH=1440x900] [seconds=15]
set -e
here=${0:A:h}; size=${1:-1440x900}; secs=${2:-15}
# The app binary from the build folder, on the installed app's own game files: an installed (bundled)
# app hidden off-screen is napped by macOS, which would measure the nap, not the game.
app="$here/../../../native/saucer-springs/.build/release/SaucerSprings"; web="/Applications/Saucer Springs.app/Contents/Resources/web"
out=$(mktemp -d)
echo "load $(sysctl -n vm.loadavg)"
"$app" --web "$web" --perf $out/app.json --size $size --seconds $secs --drive-script $here/drive-script.js >/dev/null
node $here/chrome-frames.cjs "$web" $size $secs > $out/chrome.json

python3 - "$out" <<'PY'
import json,sys
a=json.load(open(sys.argv[1]+'/app.json')); c=json.load(open(sys.argv[1]+'/chrome.json'))
for n,r in (('app',a),('chrome',c)): print(f"{n:7} ratio {r["frames"].get("ratio","-")}  p50 {r["frames"]["p50"]:6.1f} ms  p95 {r['frames']['p95']:6.1f} ms  max {r['frames']['max']:7.1f}  dpr {r['dpr']}  {r['css'][0]}x{r['css'][1]}  {r.get('gpu','')}  {r.get('profile')}")
sys.exit(0 if a['frames']['p95']<=33.5 else 1)
PY
