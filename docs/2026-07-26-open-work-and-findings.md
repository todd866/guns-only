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
