# Rapier Flight + Sound Realism — Pass 0 (Coherence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Pass 0 of the Rapier flight+sound realism program — invent a single drift inventory with dispositions, make audio fallback handover consume kernel-published Mach thresholds (same helper as briefing), and lock that with tests. No propulsion, polar, inertia, or dash-story retune.

**Architecture:** `TurboRamjetPerformanceMap` remains the sole Mach-schedule owner. Snapshot already publishes `rapier_ram_light_mach` / `rapier_full_ram_mach` / `rapier_turbine_gone_mach`. Browser teaching already formats briefing via `rapierPropulsionThresholds` in `rapier_guidance.js`. Pass 0 wires `engine_audio.js` Mach-fallback handover through that same helper, fills the living-audit drift checklist, and aligns better-sound prose that still cites obsolete M1.6–M2.7 bands.

**Tech Stack:** Vanilla ESM (`web/wwwroot/render/`), `node --test`, C# map constants as reference only (no sim retune), living markdown audit.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md`
- Living map: `docs/airframes/rapier/REALISM-AND-OVERPERFORMANCE.md` (Pass 0 checklist)
- **No physics retune** — no changes to `TurboRamjetPerformanceMap`, `FlightModel.RapierPublicDataSurrogate`, `RapierAerodynamics` schedules, or mission climb/dash Mach targets except documenting them as own/accept.
- **Do not bend FDM for audio.** Presentation consumes snapshot; never invent a second Mach schedule.
- Prefer `?audioQa=silent` for automated audio checks; register `audio-doctor` before intentional audible previews (`AGENTS.md`).
- Branch hygiene: stage **explicit paths only**, never `git add -A` (concurrent agents share the tree).
- JS quick loop: `node --test web/wwwroot/render/audio/tests/engine_audio.test.mjs web/wwwroot/render/mission/tests/rapier_guidance.test.mjs`
- C# reference only if verifying published fields: `DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter SnapshotProjection --nologo`
- Snapshot schema bump is **not** required — threshold fields already exist.
- Pass 1 (honest dash / M4 fiction) is out of scope until Pass 0 exits.

### Known truth (do not “rediscover”)

| Owner constant | Value | Snapshot field |
| --- | ---: | --- |
| `RamFadeStartMach` | 2.0 | `rapier_ram_light_mach` |
| `FullRamMach` | 2.8 | `rapier_full_ram_mach` |
| `TurbineFadeStartMach` | 1.9 | (not published — audio must not hard-require it) |
| `TurbineGoneMach` | 3.0 | `rapier_turbine_gone_mach` |

Current drift: `engine_audio.js` uses `HANDOVER_MACH_START = 1.9` and `HANDOVER_MACH_END = 2.8` as module literals for the **Mach fallback** path when thrust-kn streams are absent. Live sorties prefer thrust-share; fallback must still track map via published fields / shared helper.

Mission director Accelerate cue `M2.20` is a **profile energy gate**, not `FullRamMach` — classify **own** (mission), not map drift.

---

### Task 1: Fill Pass 0 drift checklist dispositions

**Files:**
- Modify: `docs/airframes/rapier/REALISM-AND-OVERPERFORMANCE.md` (Pass 0 checklist table)
- Verify (read-only): `sim/Propulsion/TurboRamjetPerformanceMap.cs`, `web/SnapshotProjection.cs`, `web/wwwroot/render/mission/rapier_guidance.js`, `web/wwwroot/render/audio/engine_audio.js`, `web/wwwroot/app.js` (`rapier-intercept` brief), `docs/superpowers/specs/2026-07-28-better-sound-design.md`, `sim/RapierMission.cs` (Accelerate / M2.2)

**Interfaces:**
- Produces: every Pass 0 checklist row has Disposition `own` | `fix` | `accept` with a one-line Observed note
- Consumes: nothing from later tasks

- [ ] **Step 1: Inventory with ripgrep (record findings in the checklist Observed column)**

```bash
cd /Users/iantodd/Projects/guns-only
rg -n "HANDOVER_MACH_|rapier_ram_light_mach|rapier_full_ram_mach|RamFadeStartMach|FullRamMach|M1\\.6|1\\.6→2\\.7|2\\.7" \
  web/wwwroot/render/audio/engine_audio.js \
  web/wwwroot/render/mission/rapier_guidance.js \
  web/wwwroot/app.js \
  docs/superpowers/specs/2026-07-28-better-sound-design.md \
  sim/Propulsion/TurboRamjetPerformanceMap.cs \
  web/SnapshotProjection.cs
rg -n "2\\.2|M2\\.20|accel_to_m2" sim/RapierMission.cs web/wwwroot/render/mission/rapier_guidance.js
```

Expected anchors (confirm; do not invent new owners):

- Map: `RamFadeStartMach = 2.0`, `FullRamMach = 2.8`
- Snapshot JSON already emits the three `rapier_*_mach` fields
- Briefing template uses `{RAM_LIGHT_MACH}` / `{FULL_RAM_MACH}` placeholders
- `engine_audio.js` still has `HANDOVER_MACH_START` / `HANDOVER_MACH_END` literals → **fix**
- Better-sound spec still mentions M1.6–M2.7 in regime table → **fix** (prose)
- Accelerate `M2.20` mission gate → **own** (mission profile, not propulsion map)

- [ ] **Step 2: Write dispositions into the living audit**

Replace the Pass 0 checklist Disposition / Observed cells so none remain “verify” / “inventory”. Example completed rows:

| Surface | Disposition | Observed note |
| --- | --- | --- |
| `TurboRamjetPerformanceMap` | own | closed constants |
| Runtime transition banners | own | formatted from map in `SimulationSession` |
| Intercept briefing prose | own | `{RAM_LIGHT_MACH}` / `{FULL_RAM_MACH}` via `rapierBriefingText` |
| Mission director climb/dash / Accelerate M2.2 | own | profile gate; not FullRam |
| Identity “design dash M4 (fiction)” | accept | Pass 1 owns dash-story close |
| `engine_audio.js` `HANDOVER_MACH_*` | fix | Task 2–3 |
| Better-sound regime table M1.6–2.7 | fix | Task 4 |
| HUD combined-cycle lesson | own or fix | only if still hard-coded after rg |
| Audio profile IDs | own | character only |
| Thermal ceiling cues | own | closed prior branch |

- [ ] **Step 3: Commit checklist fill**

```bash
git add docs/airframes/rapier/REALISM-AND-OVERPERFORMANCE.md
git commit -m "$(cat <<'EOF'
Fill Rapier Pass 0 drift checklist dispositions.

Record own/fix/accept for briefing, map, audio, and mission gates before any coherence code change.
EOF
)"
```

---

### Task 2: Failing tests — audio fallback handover tracks published thresholds

**Files:**
- Modify: `web/wwwroot/render/audio/tests/engine_audio.test.mjs`
- Test: same file (new tests at end of suite)

**Interfaces:**
- Consumes: existing `updateEngineVoices`, `createEngineVoices`, `freshModule` harness in the test file
- Produces: failing assertions that force Task 3 to stop using private `HANDOVER_MACH_*` literals for fallback

- [ ] **Step 1: Write the failing tests**

Append to `web/wwwroot/render/audio/tests/engine_audio.test.mjs`:

```javascript
test("Rapier Mach-fallback handover uses published ram-light and full-ram thresholds", async () => {
  const previous = globalThis.AudioContext;
  try {
    FakeAudioContext.instances.length = 0;
    globalThis.AudioContext = FakeAudioContext;
    const {
      createEngineVoices,
      updateEngineVoices,
      rapierHandoverMachFallback,
    } = await freshModule("../engine_audio.js", "handover-thresholds");

    // Exported pure helper — same numbers briefing uses when thrust-kn are absent.
    assert.equal(
      rapierHandoverMachFallback({
        mach: 2.0,
        rapier_ram_light_mach: 2.0,
        rapier_full_ram_mach: 2.8,
      }),
      0,
      "at ram-light the fallback handover fraction is 0",
    );
    assert.ok(
      Math.abs(rapierHandoverMachFallback({
        mach: 2.4,
        rapier_ram_light_mach: 2.0,
        rapier_full_ram_mach: 2.8,
      }) - 0.5) < 1e-6,
      "mid-band fallback is 0.5 with map 2.0–2.8",
    );
    assert.equal(
      rapierHandoverMachFallback({
        mach: 2.8,
        rapier_ram_light_mach: 2.0,
        rapier_full_ram_mach: 2.8,
      }),
      1,
      "at full-ram the fallback handover fraction is 1",
    );

    // Shifted published thresholds must move the fallback (proves no 1.9/2.8 literals win).
    const shiftedMid = rapierHandoverMachFallback({
      mach: 2.5,
      rapier_ram_light_mach: 2.2,
      rapier_full_ram_mach: 3.0,
    });
    assert.ok(
      Math.abs(shiftedMid - 0.375) < 1e-6,
      "fallback follows published 2.2–3.0, not module constants",
    );

    // Voices path: without thrust-kn, ram howl must stay quiet below published ram-light
    // even if mach is above the old 1.9 literal.
    const audio = new FakeAudioContext();
    const voices = createEngineVoices(audio, audio.destination, { includeMaster: true });
    const base = {
      applied_throttle: 1.55,
      engine_rpm_pct: 100,
      true_airspeed_kts: 900,
      air_density_kg_m3: 0.35,
      player_aircraft_id: "aircraft.rapier.public-data-surrogate.v1",
      rapier_ram_light_mach: 2.4,
      rapier_full_ram_mach: 3.0,
      // omit thrust-kn → force Mach fallback
    };
    for (let step = 1; step <= 16; step++) {
      audio.currentTime = step * 0.25;
      updateEngineVoices(voices, audio, { ...base, mach: 2.2 });
    }
    assert.ok(
      latest(voices.ramHowlGain.gain) < 0.02,
      "below published ram-light, fallback must not light ram howl",
    );
  } finally {
    globalThis.AudioContext = previous;
  }
});

test("rapierPropulsionThresholds and audio fallback agree on the same state", async () => {
  const { rapierPropulsionThresholds } = await import(
    "../../mission/rapier_guidance.js"
  );
  const { rapierHandoverMachFallback } = await freshModule(
    "../engine_audio.js",
    "handover-agree",
  );
  const state = {
    mach: 2.4,
    rapier_ram_light_mach: 2.0,
    rapier_full_ram_mach: 2.8,
  };
  const t = rapierPropulsionThresholds(state);
  const expected = (state.mach - t.ramLightMach)
    / (t.fullRamMach - t.ramLightMach);
  assert.ok(
    Math.abs(rapierHandoverMachFallback(state) - expected) < 1e-9,
    "audio fallback fraction must match briefing threshold helper arithmetic",
  );
});
```

Note: `freshModule` pattern already exists in this file — copy the local helper usage from neighboring tests. If `freshModule` reloads the module under a query string, the second test may need the same FakeAudioContext setup only when calling voice updates; the pure-helper import path is fine.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test web/wwwroot/render/audio/tests/engine_audio.test.mjs
```

Expected: FAIL — `rapierHandoverMachFallback` is not exported / undefined, or fallback still keyed off 1.9.

- [ ] **Step 3: Commit failing tests**

```bash
git add web/wwwroot/render/audio/tests/engine_audio.test.mjs
git commit -m "$(cat <<'EOF'
Add failing tests for Rapier audio handover threshold coherence.

Lock Mach-fallback audio to published ram-light/full-ram fields before wiring the helper.
EOF
)"
```

---

### Task 3: Wire audio fallback through shared propulsion thresholds

**Files:**
- Modify: `web/wwwroot/render/audio/engine_audio.js`
- Optionally touch: `web/wwwroot/render/mission/rapier_guidance.js` only if exporting needs a re-export (prefer import, not duplicate)

**Interfaces:**
- Consumes: `rapierPropulsionThresholds(state)` from `../mission/rapier_guidance.js`
  - Returns `{ ramLightMach, fullRamMach, turbineGoneMach }` with legacy defaults 2.0 / 2.8 / 3.0
- Produces:
  - `export function rapierHandoverMachFallback(state) → number` in `[0, 1]`
  - `updateEngineVoices` Mach-fallback path uses this helper; remove `HANDOVER_MACH_START` / `HANDOVER_MACH_END` literals

- [ ] **Step 1: Implement minimal helper + wire fallback**

At top of `engine_audio.js` (with other imports):

```javascript
import { rapierPropulsionThresholds } from "../mission/rapier_guidance.js";
```

Remove:

```javascript
const HANDOVER_MACH_START = 1.9;
const HANDOVER_MACH_END = 2.8;
```

Add:

```javascript
/// Mach-only handover fraction for old snapshots without thrust-kn streams.
/// Uses the same published thresholds as briefing / teaching copy.
export function rapierHandoverMachFallback(state) {
  const { ramLightMach, fullRamMach } = rapierPropulsionThresholds(state);
  const mach = Math.max(0, finiteNumber(state?.mach) ?? 0);
  const span = Math.max(1e-6, fullRamMach - ramLightMach);
  return smoothstep(clamp01((mach - ramLightMach) / span));
}
```

In `updateEngineVoices`, replace the fallback construction:

```javascript
  const fallbackHandover = isRapier
    ? rapierHandoverMachFallback(state)
    : 0;
```

Keep thrust-kn ownership unchanged:

```javascript
  const handover = streams?.hasThrust
    ? streams.ramShare
    : fallbackHandover;
```

Ensure `finiteNumber` / `smoothstep` / `clamp01` are already in-file (they are). If `finiteNumber` is declared below the new export, either hoist the helper below those functions or use the existing local helpers — do not duplicate.

- [ ] **Step 2: Run tests — expect PASS**

```bash
node --test web/wwwroot/render/audio/tests/engine_audio.test.mjs web/wwwroot/render/mission/tests/rapier_guidance.test.mjs
```

Expected: PASS (including new handover tests; guidance suite unchanged).

- [ ] **Step 3: Confirm no leftover handover literals**

```bash
rg -n "HANDOVER_MACH_|1\\.9.*2\\.8|handover.*1\\.6" web/wwwroot/render/audio/engine_audio.js
```

Expected: no `HANDOVER_MACH_*`; no hard-coded 1.9/2.8 handover schedule.

- [ ] **Step 4: Commit**

```bash
git add web/wwwroot/render/audio/engine_audio.js web/wwwroot/render/audio/tests/engine_audio.test.mjs
git commit -m "$(cat <<'EOF'
Drive Rapier audio Mach-fallback handover from published propulsion thresholds.

Reuse rapierPropulsionThresholds so ear and briefing cannot invent separate ram bands.
EOF
)"
```

---

### Task 4: Align better-sound prose + mark Pass 0 exit in living audit

**Files:**
- Modify: `docs/superpowers/specs/2026-07-28-better-sound-design.md`
- Modify: `docs/airframes/rapier/REALISM-AND-OVERPERFORMANCE.md`
- Modify: `docs/superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md` (Pass 0 status note only)

**Interfaces:**
- Consumes: Task 1 dispositions + Task 3 wiring
- Produces: docs that no longer teach M1.6–M2.7 as live audio truth; Pass 0 marked exited

- [ ] **Step 1: Patch better-sound design drifted numbers**

In `docs/superpowers/specs/2026-07-28-better-sound-design.md`:

1. Engine row “M1.6–M2.7 handover” → `M2.0–M2.8` (map / published fields; thrust-kn owns live mix).
2. Regime table MIL line `mach < ~1.6` → `mach < ram-light (published)` or `mach < ~2.0`.
3. Handover row `mach 1.6→2.7` → `mach ram-light→full-ram (published 2.0→2.8); live mix prefers thrust-kn share`.
4. Replace the “today’s audio uses 1.6–2.7; retune in Phase 2” paragraph with: Pass 0 wired fallback to published map fields; live mix remains thrust-kn owned.

- [ ] **Step 2: Mark Pass 0 exit in living audit**

Above the Pass 0 checklist, set:

```markdown
Status: **exited 2026-07-29** — dispositions filled; audio Mach-fallback consumes
`rapierPropulsionThresholds`; better-sound prose aligned. Pass 1 may begin (honest dash story).
```

Flip `engine_audio.js` and better-sound checklist rows from `fix` → `own`.

- [ ] **Step 3: Note Pass 0 complete on the program design**

In `docs/superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md`, under Pass sequence, annotate Pass 0:

`**0** Coherence — **exited** (see living audit Pass 0 checklist).`

- [ ] **Step 4: Final verification**

```bash
node --test web/wwwroot/render/audio/tests/engine_audio.test.mjs web/wwwroot/render/mission/tests/rapier_guidance.test.mjs
rg -n "1\\.6–2\\.7|1\\.6→2\\.7|M1\\.6–M2\\.7" docs/superpowers/specs/2026-07-28-better-sound-design.md || true
```

Expected: tests PASS; obsolete band strings gone from better-sound (or only appear in historical “what was wrong” notes if you keep one struck sentence).

- [ ] **Step 5: Commit**

```bash
git add \
  docs/superpowers/specs/2026-07-28-better-sound-design.md \
  docs/airframes/rapier/REALISM-AND-OVERPERFORMANCE.md \
  docs/superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md
git commit -m "$(cat <<'EOF'
Exit Rapier realism Pass 0: docs and audio threshold coherence.

Align better-sound regime copy with map bands and record the Pass 0 exit for Pass 1 handoff.
EOF
)"
```

---

## Pass 0 exit criteria (spec)

| Criterion | Task |
| --- | ---: |
| Drift inventory committed; each row own/fix/accept | 1 |
| Audio knots no longer duplicate map (fallback helper + tests) | 2–3 |
| Better-sound / audit prose agree with map | 4 |
| No physics / dash retune | all |

**Not in Pass 0:** M4 fiction vs ~M3.7 retune, normal-law / inertias, unstart, V-q, reentry rush character.

---

## Self-review (plan vs spec)

| Spec requirement | Plan coverage |
| --- | --- |
| Pass 0 coherence inventory | Task 1 |
| Shared threshold contract (audio must not invent Mach schedule) | Tasks 2–3 |
| Tests reject hard-coded transition claims where cheap | Tasks 2–3 |
| Prefer kernel-published constants | Task 3 via existing snapshot fields + `rapierPropulsionThresholds` |
| No physics retune | Global Constraints |
| Measurement / silent audio QA | Constraints; tests are gain/fraction assertions, not audible |
| Pass 1 blocked until Pass 0 exits | Task 4 exit annotation |

No TBD/placeholder steps remain.
