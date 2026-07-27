# Better sound — presentation audio bus and Rapier regimes (design)

Status: Recommended for implementation · 2026-07-28 · Investigation-backed; not yet flown as a feel gate.

Builds on: `docs/superpowers/specs/2026-07-16-guns-only-design.md` §12 (“Sound is half the physics feel”),
`docs/research/2026-07-16-prior-art-survey.md` (AC7 stylization lesson), existing
`web/wwwroot/render/audio/engine_audio.js`, `web/wwwroot/hud.js` gun/GCAS paths, indoor
`web/wwwroot/indoor/audio.js`, and Rapier regime docs
(`docs/airframes/rapier/30-propulsion-and-inlet.md`,
`docs/superpowers/specs/2026-07-27-rapier-zoom-lob-design.md`).

## Thesis

Sound already exists and is on the right technical path — **procedural Web Audio, no sample
library, fail-silent** — but it is fragmented, under-mixed, and mostly regime-blind. The biggest
feel win is not a new audio engine or licensed jets. It is a **single presentation audio bus** that
(1) makes the current turbine/ram/rush mix read as an airplane, (2) ties mute and HUD cues to the
same master, and (3) teaches Rapier’s defining regimes by ear: handover shove, zoom-coast silence,
RCS thruster ticks, reentry rush, catapult stroke, trap.

Stylize where real data reads flat (the AC7 lesson). Author feel on top of snapshot truth; never
bend the flight model to make audio interesting.

## Current state (2026-07-28)

### What exists

| Surface | Location | Mechanism | Works? |
| --- | --- | --- | --- |
| Engine / airframe loop | `web/wwwroot/render/audio/engine_audio.js` | Web Audio: 6 sine turbine partials, shared pink core/ram, separate q-driven rush; equal-power turbine→ram M1.6–M2.7; spool rate limits; fail-silent disable | Yes — unit-tested; audible; already Rapier-aware for ram handover |
| Gun continuous report | `web/wwwroot/hud.js` `armAudio` / `updateGunAudio` | **Separate** `AudioContext`: sawtooth + white-ish noise through lowpass; gain toggled on `gun_firing` | Weak — continuous hiss, not a gun; ignores distance/overheat nuance beyond mute of overheat |
| GCAS aural | `hud.js` `updateGcasAudio` | Square beep gated by warning/active + consciousness | Works as attention getter |
| Buffet | HUD visual only (`buffet`, `buffet_*_deg`) | No audio | Missing — Project Wingman lesson: stalls feel empty without it |
| Indoor microdrone | `web/wwwroot/indoor/audio.js` | Class with shared bus + compressor + one-shots | Better structure than flight path; pattern to steal |
| Profile ID | Snapshot `audio_profile_id` / pack `audioProfileId` | Published as `"audio.fixed-wing.jet.v1"` for Korea; `null` for modern surrogate | **Unused by client** — dead contract |
| Sample assets | under `web/wwwroot` | None (no `.mp3`/`.ogg`/`.wav` in tree) | N/A by design today |
| Howler / Tone.js | dependencies | Not present | N/A |

Call sites:

- `app.js` → `updateEngineAudio(state)` every render frame (**never passes `muted`**).
- `app.js` → `hud.setAudioEnabled(playerSettings.audio)` only affects HUD gun/GCAS.
- User gesture arms HUD audio (`armAudio`); engine context resumes itself when suspended.

### What does not work / gaps

1. **Two AudioContexts** — engine and HUD never share a master, compressor, or mute. Settings audio
   toggle silences guns/GCAS but leaves the engine running.
2. **Engine mute bug** — `updateEngineAudio` supports `{ muted }` but production never sets it.
3. **No feel layer** — buffet rumble, hit/impact, destruction, ranging ticks (Type 1), bandit gun at
   distance — absent in the flight client.
4. **Regime blindness beyond Mach handover** — zoom-coast silence, RCS thruster, reentry, catapult,
   and trap are first-class Rapier stories in docs/sim (`rapier_rcs_*`, `arrest_phase`, catapult
   mode, `rapier_turbine_thrust_kn` / `rapier_ramjet_thrust_kn`) but unused by audio.
5. **Gun is a loop, not a report** — design prose wants “gunfire with distance-appropriate report”;
   current voice is a thin continuous bed.
6. **Profile ID is aspirational** — schemas and Korea pack advertise an audio profile; renderer
   ignores it. Rapier modern surrogate publishes `null`.

### Constraints (hard)

- Browser game: user-gesture unlock, suspended contexts, Safari quirks — already handled
  fail-silently; keep that contract.
- Latency: drive continuous voices with `setTargetAtTime` from snapshot; do not decode large
  samples on the hot path.
- Asset size / license: zero sample tree today is a feature; avoid shipping megabytes of jet loops
  unless a discrete one-shot clearly fails as synthesis.
- Architecture: presentation only. Consume snapshot/events; never import `sim/` into browser audio.
- Render loop: audio update must stay O(1) per frame; no allocation on the happy path after build.
- Determinism of *sim* is sacred; audio may be non-deterministic in wall-clock scheduling but
  **noise buffers stay seeded** (existing tests) so mix decisions are reviewable.

## Approaches considered

### A — Deepen procedural Web Audio (recommended)

Extend the existing synthesis path. Unify HUD + engine onto one shared context/bus. Add regime
voices and one-shot synthesizers (gun burst, trap, catapult, RCS pulse, buffet). Steal IndoorAudio’s
bus/compressor/one-shot shape.

| Pros | Cons |
| --- | --- |
| Matches shipped direction and tests | Harder to get “cinematic” sample punch |
| Zero license / CDN / decode risk | Mix tuning is iterative fly-work |
| Snapshot fields already exist for most regimes | Some transients may stay “synth-y” |
| Fits fail-silent, small payload | — |

### B — Hybrid: procedural loops + short one-shot samples

Keep procedural continuous layers; add tiny CC0/self-authored `.ogg` one-shots for gun, trap,
catapult, hit.

| Pros | Cons |
| --- | --- |
| Better transient punch | License tracking, decode, cache, quality tiers |
| Still small if one-shots only | Contradicts current “no samples to license” invariant |
| Easy to A/B against synth | Extra failure modes (404 → silent event) |

Use only if Phase 1 gun/trap synth fails a flown feel gate.

### C — Adopt Tone.js / Howler

| Pros | Cons |
| --- | --- |
| Faster graph authoring | Dependency weight; API mismatch with existing tests |
| Built-in scheduling | Overkill for ~10 voices |
| — | Does not solve mix/regime design |

Reject for v1. Revisit only if the team wants a sequencer-heavy score layer (out of scope).

## Recommendation

**Ship Approach A.** Keep the procedural contract. Treat Approach B as an escape hatch after a
flown feel gate, not as the architecture.

Do **not** invent a parallel “presence multiplayer audio” system in this pass — remote peers are
pose/presence only today; spatial peer audio is a later product decision.

### Product feel goals (what “better” means)

1. **Identity:** pilot hears turbine vs ram vs airframe rush as distinct, readable layers.
2. **Energy:** q and buffet tell speed/AoA without looking at the tape.
3. **Rapier thesis:** coast goes quiet; RCS is sparse and expensive-sounding; reentry returns rush;
   catapult/trap bookend the sortie.
4. **Combat punctuation:** gun report and hits are events, not a second engine bed.
5. **Safety:** mute means mute; audio failure never takes down the flight kernel.

## Architecture

```
Snapshot / combat events / player settings
        │
        ▼
┌───────────────────────────────┐
│  render/audio/flight_audio.js │  ← new façade (or evolved engine_audio)
│  - ensureContext() / arm()    │
│  - setEnabled(muted)          │
│  - update(state, dt, events)  │
└──────────────┬────────────────┘
               │
     shared AudioContext + master Gain + DynamicsCompressor
               │
   ┌───────────┼────────────┬─────────────┬──────────────┐
   ▼           ▼            ▼             ▼              ▼
 engine     airframe     warnings      one-shots      (future)
 (turbine/  (rush/       (GCAS)        (gun/hit/      pack profile
  core/ram)  buffet)                    trap/cat/rcs)  mapper)
```

### Module split (exact files)

| File | Role |
| --- | --- |
| `web/wwwroot/render/audio/flight_audio.js` | **New** façade: context lifecycle, mute, `update(state, opts)` |
| `web/wwwroot/render/audio/engine_audio.js` | Keep / refine continuous propulsion + rush; export voice builders or accept shared `voices` |
| `web/wwwroot/render/audio/event_audio.js` | **New** one-shots: gun, hit, trap, catapult, RCS pulse |
| `web/wwwroot/render/audio/warning_audio.js` | **New** (or extracted from `hud.js`): GCAS / future caution tones |
| `web/wwwroot/render/audio/tests/*.test.mjs` | Extend fake-WebAudio harness; regime gain assertions |
| `web/wwwroot/app.js` | Call façade once per frame with `{ muted: !playerSettings.audio }` + recent combat events |
| `web/wwwroot/hud.js` | Remove private AudioContext; call into shared warning/gun APIs or stop owning audio |
| `web/wwwroot/indoor/audio.js` | **Do not merge yet** — keep indoor isolated; copy patterns only |
| `web/SnapshotProjection.cs` / hot frame | Prefer existing fields; add only if a regime cue is missing (unlikely for v1–v2) |
| Pack `audioProfileId` | Phase 3: map ID → mix constants; Rapier uses an explicit `audio.rapier.turbo-ram.v1` |

Sim kernel stays untouched unless a published field is missing (audit first; most cues exist).

### Snapshot fields already sufficient (audit)

Use without new bridge work where possible:

- Propulsion: `applied_throttle`, `engine_rpm_pct`, `mach`, `rapier_turbine_thrust_kn`,
  `rapier_ramjet_thrust_kn`
- Atmosphere / rush: `true_airspeed_*`, `air_density_kg_m3`, altitude
- Buffet: `buffet`, `buffet_*_deg`
- Zoom / RCS: `rapier_rcs_authority`, `rapier_rcs_gas_frac`, `rapier_nose_on_v_err_deg`,
  `rapier_zoom_lob`, job/phase tokens as available
- Deck: `arrest_phase`, arrest tension/decel, catapult via flight `mode` / session phase strings
  already projected for HUD
- Guns: `gun_firing`, `gun_overheat`, trigger / combat events already consumed by HUD

### Rapier regime mix (authoritative targets)

| Regime | Ear | Control sources | Mix intent |
| --- | --- | --- | --- |
| Taxi / spool | Rising partial stack | `engine_rpm_pct` spool | Quiet rush; clear RPM story |
| MIL / wet climb | Turbine + core dominant | throttle, rpm, mach &lt; ~1.6 | Punch without clipping |
| Turbine→ram handover | Equal-power swap (already) | mach 1.6→2.7; optionally weight by thrust split | Audible shove; no energy hole |
| High-q dash | Broad ram + bright rush | ram thrust, q | Rush owns “fast” even at idle |
| Zoom coast / exo | **Near silence** | low q + low thrust + high `rapier_rcs_authority` | Drop rush/engine to whisper; leave cabin/electric bed optional later |
| RCS | Sparse cold-gas ticks/hiss | authority × stick demand proxy (derive from rate change or publish later) | Expensive, not continuous rocket |
| Reentry | Rush returns, possibly “harsher” band | rising q + density | Distinct from subsonic rush |
| Catapult | Rising acceleration roar / rail grind one-shot + engine spool | catapult active | Short, violent, then airborne loop |
| Trap | Wire snatch + tension groan decaying with `arrest_*` | `arrest_phase`, tension, decel | One event + decaying bed; bolter is different |
| Gun | Short cyclic reports while firing | `gun_firing` | Event cadence, not continuous saw |
| Buffet | Low rumble / modulation | `buffet` + buffet angle magnitude | Pre-stall warning by ear |
| GCAS | Keep existing square attention getter | warning/active | Unchanged semantics |

Align handover Mach band with propulsion bible where practical (`M1.9–M3.0` fade /
`M2.0–M2.8` ram) — today’s audio uses 1.6–2.7; retune toward map constants in Phase 2 so ear and
instruments agree.

## Phased delivery

### Phase 0 — Correctness (hours)

- Wire `muted: !playerSettings.audio` into engine update **or** fold mute into the new façade.
- Document the two-context problem; do not leave mute half-broken.

### Phase 1 — Feel gate (v1)

Goal: “this finally sounds like a jet fight,” before Rapier exo polish.

1. Shared context + master + light compressor (Indoor pattern).
2. Retune engine mix levels / filters for headphone clarity (stylize).
3. Replace continuous gun bed with short synthesized reports while `gun_firing`.
4. Add buffet rumble from `buffet` (+ optional angle magnitude).
5. Keep GCAS on the shared bus.
6. Fly the feel gate: spool, acceleration, gun, buffet, mute — checklist in plan, not this spec.

Exit: mute works; gun and buffet read; engine still fail-silent; tests green.

### Phase 2 — Rapier regimes

1. Coast silence when q and thrust collapse / RCS authority high.
2. RCS thruster one-shots or amplitude-gated hiss from `rapier_rcs_*` (and stick demand if needed).
3. Reentry rush character distinct from tropospheric rush.
4. Catapult and trap event beds from arrest/catapult snapshot edges.
5. Optionally retune turbine/ram crossfade to propulsion map Mach bands; bias gains with
   `rapier_*_thrust_kn` so lever-only fuel lies less to the ear.

Exit: a zoom-lob sortie is narratable with eyes closed through boost → quiet → RCS → reentry →
trap.

### Phase 3 — Polish / pack profiles

1. Hit / destroy one-shots from combat events (mirror visual effects events).
2. Soft distance attenuation for bandit gun if/when peer or AI muzzle events are available.
3. Honor `audio_profile_id` with a tiny constant table (`audio.fixed-wing.jet.v1` vs
   `audio.rapier.turbo-ram.v1`); Rapier stops publishing `null`.
4. Type-1 ranging tick if that sight lands.
5. Only then consider Approach B one-shot samples for any event that still fails the gate.

## Non-goals

- Licensed commercial jet sample packs or middleware (FMOD/Wwise).
- Music / dynamic score.
- Spatialized multiplayer cockpit audio.
- Changing FDM numbers to “sound better.”
- Merging indoor and flight audio modules in the first pass.
- Perfect physical acoustics (doppler of ownship engine, accurate shock/sonic boom model).

## Testing

- Keep / extend `engine_audio.test.mjs` fake-WebAudio style: gain targets, handover completion,
  rush independent of throttle, mute, unsupported-context disable.
- Add regime tests: at low q + high RCS authority, engine/rush gains near floor; catapult/arrest
  edges fire one-shot schedulers once.
- No CI dependency on real AudioContext output; human feel gate remains mandatory (same lesson as
  M0 visuals).

## Risks

| Risk | Mitigation |
| --- | --- |
| Synth remains thin on headphones | Phase 1 mix pass; Approach B escape hatch for gun/trap only |
| Over-loud compressor / clipping | Master ceiling + Indoor-like dynamics; test on laptop speakers |
| RCS without stick-demand field sounds wrong | Gate on authority × buffet-free rate proxy, or publish a tiny demand fraction later |
| Scope creep into score/VO | Non-goals; keep to physics-feel and deck events |
| Mute regression | Single façade owns enablement; one settings path |

## Implementation plan pointer

After approval, write `docs/superpowers/plans/2026-07-28-better-sound.md` with task-sized steps
starting at Phase 0–1. Do not implement Phase 2 regime polish until Phase 1 is flown.

## Open questions (do not block Phase 0–1)

1. Should Rapier publish an explicit `audio.rapier.turbo-ram.v1` immediately, or keep `null` until
   Phase 3?
2. Is a faint “cabin electric” bed during exo coast desirable, or is true near-silence the thesis?
3. Trap audio: wire snatch only, or continuous tension bed for the whole arrest runout?
