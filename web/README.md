# Guns Only — web build

The **same compiled C# sim kernel** as the desktop game, running in the browser via WebAssembly.
Not a port: `sim/GunsOnly.Sim.csproj` has zero Godot references (that was enforced in review for
testability — it turned out to be what makes a web build possible at all), so it compiles to wasm
unmodified. Only the shell is new: three.js rendering, canvas-2D HUD, JS input.

That means **both shells drive identical physics**, so `bin/mission <scenario>` is a conformance
suite: run a scenario through desktop and web and the telemetry should match to the digit.

## Run it
```
cd web
dotnet publish -c Release -o /tmp/gunsweb
cd /tmp/gunsweb/wwwroot && python3 -m http.server 8877
# open http://localhost:8877/
```

## Layout
- `WebBridge.cs` — the JS-facing facade. A deliberate mirror of `bridge/SimBridge.cs`: same
  120 Hz fixed step, same capped catch-up, same HUD field names.
- `wwwroot/app.js` — three.js FPV shell (attitude-rigid nose camera, gimbal/padlock, sky, sea).
- `wwwroot/hud.js` — canvas-2D glass HUD (aircraft-referenced symbology, SA bar, TD box).
- `wwwroot/vendor/three.module.js` — vendored, no CDN.

## Frame convention (the #1 hazard)
Sim world is X=east, Y=up, Z=north — a LEFT-handed physical basis. three.js is right-handed with
-Z forward. Convert by negating Z, and build the aircraft basis FROM the kernel's own frame
(`zAxis = -fwd; xAxis = up × zAxis; basis(xAxis, up, zAxis)`). Do NOT reconstruct orientation
from world-up or bank angle — that rendered every roll backwards and snapped 180° at loop apex
on the desktop, and no code review caught it; flying it did.

## Known rough edges (2026-07-17, first working build)
It boots and flies, but it is not tuned. Payload is ~2.8 MB (mostly the .NET runtime; would
shrink with the `wasm-tools` AOT workload, which needs sudo to install). Not yet verified:
telemetry conformance against desktop, roll direction under a real roll input, beat 4 at 70k.
