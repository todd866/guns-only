# Better sound — presentation audio bus and Rapier regimes (design)

Status: Phase 0–1 feel gate implemented · 2026-07-28 · Investigation-backed; flown mute + layered jet path in code.

Builds on: `docs/superpowers/specs/2026-07-16-guns-only-design.md` §12 (“Sound is half the physics feel”),
`docs/research/2026-07-16-prior-art-survey.md` (AC7 stylization lesson), existing
`web/wwwroot/render/audio/engine_audio.js` / `flight_audio.js`, `web/wwwroot/hud.js` gun/GCAS paths, indoor
`web/wwwroot/indoor/audio.js`, and Rapier regime docs
(`docs/airframes/rapier/30-propulsion-and-inlet.md`,
`docs/superpowers/specs/2026-07-27-rapier-zoom-lob-design.md`).

## Research synthesis (what “sounds like a jet” requires)

Authoritative / practitioner sources consulted for the Phase 1 voice stack (not vibes):

| Source | Takeaway used |
| --- | --- |
| NASA / system-noise auralization (fan forward/aft, core, jet; broadband subtractive + additive R–S tones) | Separate **tonal fan/compressor**, **core**, and **jet exhaust** layers; do not rely on one filtered-noise bed |
| Chalmers turbofan decomposition (fan dominates approach; jet + fan at takeoff; Heidmann-style fan/compressor) | Fan tip / BPF **whine** is identity; exhaust roar tracks power |
| Sound.SE jet synthesis thread (harmonics + LF body; lowpass with resonance beats thin bandpass-only hiss) | Additive partials + **resonant lowpass exhaust**; keep bottom end |
| Andy Farnell / Red Blob Games motor notes (noise through resonant filters; Q as character) | Narrow high-Q bandpass for fan whine; shared pink field shaped per layer |
| MDN Web Audio best practices (`setTargetAtTime`, gesture `resume`) | Continuous gains via `setTargetAtTime`; fail-silent suspended contexts |

**Cockpit / ownship stack chosen (Approach A, procedural):** fan/compressor **sawtooth orders** in the hundreds of Hz–kHz (HP/LP gated so they cannot organ-boom), pink **core** + **jet body**, white mid-band **grit** with LFO crackle AM, mild WaveShaper saturation, short feedback delay as exhaust “pipe,” fan-whine BP, ram BP, q-driven rush — density-scaled and coast-gated. No sample packs.

**Retune note (post feel-gate):** the first Phase 1 ship (64 Hz sine stack + polite pink bed) read as synth-reactor, not jet. The retune targets NASA/Chalmers layering + Farnell/Sound.SE subtractive roar character. Preview: `web/wwwroot/render/audio/preview/jet_preview.html`; offline regime WAVs via `preview/jet_wav_export.html` / `render_jet_wavs.mjs`.

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

### What exists (post Phase 0–1)

| Surface | Location | Mechanism | Works? |
| --- | --- | --- | --- |
| Flight façade | `web/wwwroot/render/audio/flight_audio.js` | Shared `AudioContext` + master + DynamicsCompressor; mute; drives engine/events/warnings | Yes — unit-tested |
| Engine / airframe loop | `engine_audio.js` | Partials + fan whine + core + jet exhaust + ram + q rush; density + coast gate; M2.0–M2.8 map / published fields; thrust-kn owns live mix | Yes — deepened |
| Gun reports | `event_audio.js` | Weapon-rate body/gas/mechanism bed + varied clustered reports while `gun_firing` | Yes — profile-driven |
| Buffet rumble | `event_audio.js` | Boolean floor plus progressive measured angular disturbance / AoA | Yes |
| Cockpit palette | `engine_audio.js` + `samples/jet/` | Independent F-22/Rapier interior alternates with slow time-only crossfade | Yes — Build 170 |
| Cabin floor | `engine_audio.js` | ECS airflow + 400 Hz electrical bed outside propulsion coast gate | Yes — restrained |
| F-22 state cues | `engine_audio.js` | Published lever stop/spool power, structure-borne RPM trace, dedicated q-band canopy flow | Yes — independent axes |
| Pilot load | `event_audio.js` | Positive-G suit/harness/structure versus negative-G unload/strap voice | Yes — signed G + onset |
| Other aircraft | `event_audio.js` | Occluded fighter pass plus heavy-turboprop and long-range Tu-95 contra-prop classes | Yes — range/closure driven |
| Internal gun character | `event_audio.js` | M61/GSh-301/M3 cadence profiles; persistent cyclic body + varied clustered reports | Yes — snapshot-profile driven |
| Configuration mechanisms | `event_audio.js` | Gear/flap motion, hydraulic bed, door and lock edges | Yes |
| GCAS aural | `warning_audio.js` | Square beep on shared bus | Yes — same semantics |
| HUD audio | `hud.js` | Delegates arm/enable to façade; no private context | Mute unified |
| Indoor microdrone | `indoor/audio.js` | Unchanged; pattern source for bus/compressor | Isolated |

Call sites:

- `app.js` → `updateFlightAudio(state, { muted: !playerSettings.audio, triggerHeld, nowSeconds })` every frame.
- `app.js` / HUD → `setFlightAudioEnabled` / `armFlightAudio` for settings + gesture unlock.

### What does not work / remaining gaps

1. ~~Two AudioContexts~~ — **fixed** in Phase 0–1 (shared façade).
2. ~~Engine mute bug~~ — **fixed** (`muted: !playerSettings.audio`).
3. Ranging ticks — still absent. Hit/destruction are present and now range-attenuated.
4. Full Rapier Phase 2 polish — RCS ticks, catapult, trap, coast silence, and density are in;
   a dedicated re-entry character remains deferred.
5. ~~Gun is a loop / fixed cadence~~ — **fixed** (published weapon cadence + clustered reports).
6. Profile ID is aspirational — schemas advertise an audio profile; renderer still ignores pack mapping.

### Research corpus

The tracked catalogue is `audio/jet-library/catalog.json`; synchronized raw video, extracted
analysis WAV, provider metadata, hashes, and the local review gallery live under the gitignored
`analysis/jet-audio-library/`. Reference-only media never crosses into `web/wwwroot`.

Sources are classified by microphone perspective before aircraft type. Timecoded analysis labels
engine power, dynamic pressure, and signed G independently; recording loudness is never treated as
a throttle label. The local gallery keeps video attached because HUD, controls, manoeuvre, camera
mount, clipping, and edits are often the only evidence for what the sound represents.

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
| MIL / wet climb | Turbine + core dominant | throttle, rpm, mach &lt; ram-light (published) | Punch without clipping |
| Turbine→ram handover | Equal-power swap (already) | mach ram-light→full-ram (published 2.0→2.8); live mix prefers thrust-kn share | Audible shove; no energy hole |
| High-q dash | Broad ram + bright rush | ram thrust, q | Rush owns “fast” even at idle |
| Zoom coast / exo | **Near silence** | low q + low thrust + high `rapier_rcs_authority` | Drop rush/engine to whisper; leave cabin/electric bed optional later |
| RCS | Sparse cold-gas ticks/hiss | authority × stick demand proxy (derive from rate change or publish later) | Expensive, not continuous rocket |
| Reentry | Rush returns, possibly “harsher” band | rising q + density | Distinct from subsonic rush |
| Catapult | Rising acceleration roar / rail grind one-shot + engine spool | catapult active | Short, violent, then airborne loop |
| Trap | Wire snatch + tension groan decaying with `arrest_*` | `arrest_phase`, tension, decel | One event + decaying bed; bolter is different |
| Gun | Short cyclic reports while firing | `gun_firing` | Event cadence, not continuous saw |
| Buffet | Low rumble / modulation | `buffet` + buffet angle magnitude | Pre-stall warning by ear |
| GCAS | Keep existing square attention getter | warning/active | Unchanged semantics |

Pass 0 wired Mach-fallback to published map fields via `rapierPropulsionThresholds`; live mix
remains thrust-kn owned (`rapier_turbine_thrust_kn` / `rapier_ramjet_thrust_kn`). Map bands:
`M1.9–M3.0` turbine fade · `M2.0–M2.8` ram overlap — ear and instruments share the same
published thresholds.

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

**Jet voice (Approach B):** Pure procedural failed the ear gate twice vs F-16 cockpit/AB
footage. Hybrid now: CC0 F-4 loop beds under `samples/jet/` (idle/mil/grit) own Rapier
identity; procedural handles rush, accents, coast, handover. See `samples/jet/SOURCES.md`.
Listen: `preview/jet_preview.html` (includes maglev catshot button).

### Phase 2 — Rapier regimes

1. ~~Coast silence when q and thrust collapse / RCS authority high.~~
2. ~~RCS thruster one-shots or amplitude-gated hiss from `rapier_rcs_*`.~~
3. Reentry rush character distinct from tropospheric rush (still open).
4. ~~Maglev buried-tube catshot~~ — EM climb + tunnel pressure + rail spark + portal exit;
   snapshot fields `catapult_active` / `catapult_progress` / `catapult_speed_kts`.
5. ~~Trap one-shots from `arrest_phase` edges~~ — snatch / stretch / stop / fail.
6. ~~Hit / destroy~~ — snapshot edges on `hits` / `opponent_alive`.
7. Turbine→ram crossfade retuned to map bands M1.9–M2.8; thrust-kn bias partial.

Exit: a zoom-lob sortie is narratable with eyes closed through boost → quiet → RCS → reentry →
trap.

### Phase 3 — Polish / pack profiles

1. Hit / destroy one-shots from combat events (mirror visual effects events).
2. Soft distance attenuation for bandit gun if/when peer or AI muzzle events are available.
3. ~~Honor `audio_profile_id`~~ — `audio.rapier.turbo-ram.v1` / `audio.f22a.aged-twin-fan.v1` /
   `audio.fixed-wing.jet.v1` published from snapshot; renderer resolves character from profile.
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

Plan: `docs/superpowers/plans/2026-07-28-better-sound.md`. Phase 0–1 feel-gate slice is in code;
do not implement remaining Phase 2 regime polish until that slice is flown.

## Open questions (do not block Phase 0–1)

1. Should Rapier publish an explicit `audio.rapier.turbo-ram.v1` immediately, or keep `null` until
   Phase 3?
2. Is a faint “cabin electric” bed during exo coast desirable, or is true near-silence the thesis?
3. Trap audio: wire snatch only, or continuous tension bed for the whole arrest runout?
