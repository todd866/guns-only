# Hardware spikes — results log

Four spikes, per spec Task 13. Each has a scene/script under `spikes/`. The ULP
check is headless-runnable and its numbers below were captured directly from a
run in this environment. The other three need a display and human hands/eyes —
they are templated below as **AWAITING USER INPUT**.

---

## 1. Chord / ghosting test

Scene: `spikes/chord_test.tscn` — `bin/godot --path . spikes/chord_test.tscn`

Verified headless-clean (`bin/godot --headless --path . spikes/chord_test.tscn
--quit-after 60`, exit 0, no script errors) — the scene loads and runs. The
actual chord-registration behavior can only be observed with real hands on the
target MacBook's internal keyboard.

**USER TASK (5 min):** run the scene, hold each chord below, note which keys
register at once (screen shows `HELD (n): key, key, ...`).

Test chords:
- ↑ + → + F
- ↑ + → + A
- ↑ + → + A + F
- ↑ + ← + D + W
- ↓ + ← + F

**Acceptance:** every ≤3-key fight chord registers all keys held. 4-key
failures are tolerated by spec (no mandatory chord exceeds 3 keys) — note them
if they occur, but they don't fail the gate.

| Chord | All keys registered? | Notes |
|---|---|---|
| ↑ + → + F | AWAITING USER INPUT | |
| ↑ + → + A | AWAITING USER INPUT | |
| ↑ + → + A + F | AWAITING USER INPUT | |
| ↑ + ← + D + W | AWAITING USER INPUT | |
| ↓ + ← + F | AWAITING USER INPUT | |

**Verdict:** AWAITING USER INPUT

---

## 2. Gesture momentum spike

Scene: `spikes/gesture_spike.tscn` — `bin/godot --path . spikes/gesture_spike.tscn`

Verified headless-clean (`bin/godot --headless --path . spikes/gesture_spike.tscn
--quit-after 60`, exit 0, no script errors) — the scene loads and runs.
`InputEventPanGesture`/`InputEventMagnifyGesture` only arrive from a real
trackpad under a display server, so the momentum-tail measurement itself needs
the user.

**USER TASK:** two-finger scroll on the trackpad, then lift fingers cleanly.
Read the logged `pan d=(...) gap=Nms` lines — note how many ms after lift the
deltas keep arriving (macOS inertial scrolling) and their decaying magnitude.

- Momentum tail duration after lift: AWAITING USER INPUT (ms)
- Decay shape (linear / exponential / stepped): AWAITING USER INPUT
- **Deadband/damping decision for M-later ranging input (spec §7):** AWAITING USER INPUT

---

## 3. Altitude look spike

Scene: `spikes/altitude_look.tscn` — `bin/godot --path . spikes/altitude_look.tscn`

Node3D with a noise-displaced `PlaneMesh` (100000×100000, `ShaderMaterial` in
`spikes/altitude_terrain.gdshader` displacing `VERTEX.y` by
`texture(noise_tex, UV).r * 800.0` from a `NoiseTexture2D`/`FastNoiseLite`),
the same `WorldEnvironment` fog/sky settings as `game/main.tscn`, camera at
`(0, 6000, 0)` pitched −15° (`far = 80000`), plus a minimal WASD/QE keyboard
fly-cam (`spikes/altitude_look.gd`) for looking around.

Verified headless-clean (`bin/godot --headless --path . spikes/altitude_look.tscn
--quit-after 60`, exit 0, no script or shader-compile errors) — the scene
loads, the noise texture generates, and the shader compiles. Whether the
haze/scale actually *reads* as altitude is a judgment call that needs eyes on
a display; not attempted here.

**USER TASK — judge by eye:** open the scene, fly around. Does the haze +
scale read as "20,000 ft over Korea", or does it read as a miniature?

- Verdict: AWAITING USER INPUT
- Screenshot: AWAITING USER INPUT (attach or link)
- Notes (fog density / height_scale / noise frequency tuning, if any): AWAITING USER INPUT

---

## 4. ULP check (headless — run and recorded)

Script: `spikes/ulp_check.gd` — `bin/godot --headless -s res://spikes/ulp_check.gd`

Run in this environment on 2026-07-17. Actual output:

```
Godot Engine v4.7.1.stable.mono.official.a13da4feb - https://godotengine.org

at 5000 m: float32 step = 0.000488 m
at 20000 m: float32 step = 0.001953 m
at 40000 m: float32 step = 0.003906 m
```

(The brief's back-of-envelope estimate was ≈0.0006 / 0.0024 / 0.0048 m —
same order of magnitude; the measured values above are the actual float32 ULP
steps at those distances from Godot's single-precision `Vector3`, and are what
should be trusted.)

**Reading:** at the arena's ±20 km edge, the render-frame quantum is
~2.0 mm (0.001953 m) — invisible at jet scale (aircraft are tens of feet
long, closure rates are hundreds of knots). At the ±40 km worst case it's
still only ~3.9 mm. **The bounded ±20 km arena stands** — no float32
precision concerns for M0's flat-sea, bounded-arena scope.

---

## Summary for the M0 gate

| Spike | Headless load | Result needing human eyes/hands |
|---|---|---|
| Chord/ghosting | Clean, exit 0 | AWAITING USER INPUT |
| Gesture momentum | Clean, exit 0 | AWAITING USER INPUT |
| Altitude look | Clean, exit 0 | AWAITING USER INPUT |
| ULP check | N/A (headless script) | Done — numbers above, arena bound confirmed |

See `docs/m0-gate.md` for how these feed the go/no-go decision.
