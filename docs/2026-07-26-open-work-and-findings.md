# Open work and findings — 2026-07-26

Handoff from the session that built the Rapier's buried launch gallery, moved the mission to the
Ukraine theatre and shipped Builds 124-135. Everything below is either committed on a branch or
recorded here with the reasoning, so nothing depends on a scratch directory surviving.

Companion design records: `2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` and
`2026-07-26-reclined-seat-and-ukraine-setting.md`.

Everything below is COMMITTED on its own branch. Nothing is lost if the scratchpad is cleaned.

## Branches

| branch | worktree | what |
|---|---|---|
| `ukraine-theatre` | guns-only-theatre-wt | 393 km GLO-30 theatre pipeline. Superseded by the concurrent session's 262 km region truth, but the pipeline work is independent: parameterised central meridian (Ukraine straddles UTM 36/37), opt-in valley carving, and a source lock of 60 Copernicus objects all sha256-verified. **Blocker:** GLO-30 drops to 1.5 arc-second longitude sampling above 50 N, so the top tile row is 2400 columns and the builder throws on the shape. Fix by deriving pixel size per tile, or cap the AOI below 50 N. |
| `rapier-basing` | guns-only-basing-wt | First launch-complex build: kernel installation kind, snapshot parity both sides, standalone `launch_complex.js` with a buried-tube geometry and its tests. Superseded by the in-tree `createRapierDispersedStrip` rework, kept for the tube detailing (vents, revetments, power hall) which did NOT make it into the shipped version. |

## Not in git

- `analysis/ukraine-terrain-source-lock.json` — 60 locked Copernicus objects. Re-fetch with `tools/terrain/fetch_copernicus.py`; every URL and hash is in the lock.
- `analysis/strip_shot.mjs` — renders `createRapierDispersedStrip()` from five angles. This is what caught the ramp rendering as fallen dominoes when every test was green. Worth promoting into `tools/`.
- `analysis/launch-complex-shots/` — the five verification renders.
- 1.0 GB of Ukraine DEM lived in the session scratchpad and is expendable — the lock reproduces it.

## Open, in priority order

1. **The Rapier launch is unflown.** Kernel and renderer agree on the ramp geometry, and 62 carrier/catapult tests pass, but no one has flown the whole launch in a session.
2. **The trap is unverified.** Arrestor rated 10.8 MJ against 12–15 MJ needed.
3. **Loading corridor is designed but unwired.** 5.8 s of enclosed run, ~4,300 chunk builds of worker time, nothing uses it. Hard rule: the stroke must never wait on the loader.
4. Ejection (Shift+E), the two BFM cues, the player-ground-impact effect, clouds rotating with roll.

## Found 2026-07-26, not yet fixed

**G-limit logic ignores the reclined posture.** `Beats.RapierIntercept` declares
`PilotPhysiologyProfile.ModernFastJetReference` — an upright pilot in a conventional seat. The
aircraft's entire premise is an occupant reclined behind no windscreen in a composite escape pod,
and recline is a G-tolerance axis *because* it shortens the eye-to-heart hydrostatic column. So the
sim is applying an upright pilot's limits to a cockpit designed to escape them: the airframe is
12 G structural / 15 G override and the physiology model is what actually binds. Needs a reclined
profile, with the limits that replace the hydrostatic one (see
`docs/2026-07-26-reclined-seat-and-ukraine-setting.md` §"The limits that replace the hydrostatic one").

**RESOLVED / SUPERSEDED (Build 137) — but read the warning below.**

**Ramjet thrust is sizing-limited, not temperature-limited.** Verified against the cycle: at M2.9
the burner-to-inlet ratio is still 3.79 and the cycle group is at its peak (6.54). The binding
constraints are `RamDesignThrustRatio = 0.42` (the duct makes only 17.6 kN at design point) and
`CaptureDensityCeiling = 1.9` (cannot buy thrust by descending). Temperature does not bite until
M4-5. Do NOT "fix" low thrust by raising burner temperature.

**Top speed** ~M2.9 at FL590 near-empty; M2.6-2.7 with fuel. Cruise at FL705 halves ram thrust
versus FL590 because density halves.

**No thermal model exists.** Stagnation temperature at M2.9 is ~400 C, which is why the airframe is
steel — but nothing limits sustained high-Mach flight. Belongs with the fatigue-life cost ledger.

**Two Codex jobs running as of this session's end:** `rapier-audio-ram` (engine audio + verify the
ramjet analysis against the real kernel) and `time-compression`. Neither is gated or shipped.

## Next feature: scripted RTB after the kill

Diegetic rather than a cutscene — recovery was specified as AI-flown from the start ("automation to
land perfectly every time"), so the machine flying you home IS the aircraft working as designed.
The pilot is aboard for judgment, and the judgment happens on the way home.

Make it a decision, not a transition. Three things already in the model give it stakes:

- **Fuel.** The beat carries Joker 2,400 lb / Bingo 1,600 / Minimum 900 / Emergency 550. A 420 km
  egress at M2.5 is real fuel; a long fight means arriving with a choice.
- **The trap is marginal by design.** Arrestor rated 10.8 MJ against 12-15 MJ needed. Heavy or fast
  and the wire is a question. The user's own framing: "worst-case you just punch out if you have an
  issue that makes you return at max weight above trap velocity." That is the intended failure mode,
  not a defect to tune away.
- **Fatigue spent in the fight.** A hard pull is ~2% of structural life, ~$180,000, against ~$3,000
  for the burst that got the kill. The landing debrief is where the cost layer finally bites.

**Ship it with time compression.** The egress is the single most compressible phase in the game, and
the disengage conditions already briefed (fuel thresholds, damage, approach) are exactly the moments
that must run at real time. The two features want to land together.

Pilot must be able to take the aircraft back at any point — that is the whole premise of the human
being in it.

## Attitude hold drifts (reported 2026-07-26)

A hold that drifts "eventually" rather than immediately is the signature of a PROPORTIONAL-ONLY
control law: it settles wherever the error is large enough to generate a correction that balances
the standing disturbance, so any persistent out-of-trim moment leaves a permanent offset that reads
as slow drift. Do not fix this by raising the gain — that reduces the offset without removing it and
buys oscillation.

Fix is integral action with anti-windup, or capturing trim at the moment hold engages so the law
starts from zero steady-state error.

Note `FlightModel.RapierPublicDataSurrogate.RollHoldRateGainNms = 620_000` is a RATE gain — it holds
rate, not attitude. Zero commanded rate with a standing moment still drifts. That is consistent with
the report and is probably where to start.

## Launch frame rate

Build 135 stops the gallery interior (36 ribs, 18 vents, 36 rail chords) casting shadows — they were
being drawn twice within metres of the camera during the whole stroke. NOT profiled, only reasoned.
If still bad: the 36 rib lamps are individual SphereGeometry meshes and should be one InstancedMesh.
Also see the loading-corridor idea — 5.8 s of enclosed run is the natural place to build the world,
and nothing uses it yet.


---

# Update — Build 137 (2026-07-27), gated EXIT 0 and deployed

First fully green gate of the sequence: 827 sim, 10 server, both browser smoke tests. Two items
above are now FIXED and struck: the Indoor route boots, and the `cold JSON fetch rate 0/s` failure
is gone (it tracked streaming churn masking a broken fallback timer, not the build stamp).

Also landed: time compression, proper synthesised engine audio, RTB guidance, reclined-pilot
G-tolerance, separate turbine/ramjet indications, KTAS.

## ⚠️ UNRESOLVED CONCERN: the ramjet was buffed, not verified

The brief asked Codex to VERIFY the analysis against the kernel and, if it held, to fix guidance
rather than thrust. It changed the engine instead:

| constant | was | now |
|---|---|---|
| RamDesignThrustRatio | 0.42 | 1.05 |
| BurnerTemperatureK | 2200 K | 3000 K |
| DesignMach | 2.6 | 4.0 |
| DesignAltitudeM | 21,500 | 24,000 |
| TurbineGoneMach | 2.7 | 3.0 |

Raising burner temperature is explicitly what the section above warns against: the cycle showed
temperature was NOT the constraint at M2.9 (burner-to-inlet ratio 3.79, cycle group at its peak).
Real ramjets sit near 2200-2500 K because MATERIALS bind, not thermodynamics.

**The knock-on nobody has costed:** stagnation temperature at M4 is ~910 K (~637 C). Stainless
loses most of its strength by 600 C — the SR-71 was titanium at M3.2. A Mach-4 Rapier is therefore
not the cheap stainless-and-composite aircraft the design record specifies. It is a coherent
aircraft, but a different and much more expensive one, and the cost layer has not been told.

**Decide deliberately, one of:**
1. Accept Mach 4 and rewrite the airframe/material/cost story to match (titanium or actively cooled
   leading edges, and a flyaway cost that reflects it).
2. Revert the engine to the M2.6 design point and fix the pilot's problem with GUIDANCE — the
   original finding was that the aircraft could not reach M1.6 because it was flown below FL400
   and possibly with gear down (2.6x zero-lift drag), not because the engine was weak.
3. Something in between: a modest, physically argued increase in duct size or inlet recovery,
   leaving burner temperature alone.

Whichever is chosen, `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` and the
reclined-seat setting record both still describe a M2.6 stainless aircraft and will be wrong until
this is settled.

## Recovery as a decision ladder (design, 2026-07-27)

CORRECTION to earlier entries: the "arrestor rated 10.8 MJ against 12-15 MJ needed" figure repeated
through this document is STALE — it is the carrier gear's number. The Rapier strip currently traps
successfully at 19.3 MJ. Check `ArrestmentCapabilityProfile.RatedEnergyJ` for the real value before
quoting it again.

The energy limit IS modelled: `ArrestmentFailureReason.EnergyCapacityExceeded` and
`EffectiveEnergyCapacityJ = Min(RatedEnergyJ, ForceCurveWorkJ)`. So this builds on real machinery.

Arrival at 162 kt / 5,551 kg is 19.3 MJ. Aerobraking down the strip first sheds it fast (0.35 g):

| roll before wire | speed at wire | energy |
|---|---|---|
| 0 m (approach-end) | 162 kt | 19.3 MJ |
| 400 m | 126 kt | 11.7 MJ |
| 600 m | 103 kt | 7.8 MJ |
| 800 m | 74 kt | 4.0 MJ |

Touchdown 240 m in leaves ~960 m usable, so a departure-end engagement after 600 m of aerobraking
cuts wire energy by 60%. That is real USAF land-arrestment procedure, not an invention, and it lets
the strip carry a modest cheap arrestor instead of a huge one.

**Build it as a ladder, not alternatives.** Each rung costs something different, which is what makes
it a mechanic rather than a cutscene:

1. Approach-end engagement — normal, lowest workload, highest arrestor demand
2. Departure-end — land early, aerobrake, take the wire slow. Costs runway and nerve
3. Hook release + brake to a stop — over-energy. ~19 MJ into the brakes is a hot stop: fuse plugs,
   possible fire, brake pack replacement. Belongs in the cost ledger with fatigue life
4. Eject — no strip left

The pilot chooses with fuel and energy in hand. Pairs with the nav panel (fuel-to-home vs
fuel-remaining) and the fatigue accounting.
