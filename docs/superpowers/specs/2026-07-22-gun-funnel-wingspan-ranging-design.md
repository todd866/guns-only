# Gun funnel → real wingspan-ranging funnel

Date: 2026-07-22

## Problem

The HUD "gun funnel" (`web/wwwroot/render/hud/gun_funnel.js`, drawn by
`hud.js#drawGunFunnel`) did not work as a ranging device:

- **Fake vertical axis** — rungs placed at `yPx = 18 + fraction*88`, a fixed decorative
  band below the boresight, unrelated to range or to where the target actually is.
- **Magic range endpoints** — `nearRangeM = min(220, v·t·0.22)`, `farRangeM` from
  `v·t·0.78`, then hard-clamped, so the band was ~220–1180 m for *every* realistic gun.
  Muzzle velocity / flight time were inert.
- **Static, target-never-inside-it** — the funnel hung below the gun cross and the
  target never sat in it, so wingspan ranging was impossible.
- **Dead output** — `timeOfFlightSeconds` was computed per sample and never read.

Net: only the width formula was legitimate; everything that would make it a usable
ranging cue was cosmetic or clamped away.

## Goal

Make it a real wingspan-ranging funnel, and show it only when it is usable.

## How a real wingspan-ranging funnel works

Two rails hang from the gun cross. The horizontal gap between them at a given point
equals the on-screen span that the target's **known wingspan** subtends at the range
mapped to that point — **narrow = far, wide = near**. The pilot pulls lead so the
bandit's wingtips just touch both rails; touching = correct (effective) range on a valid
solution → fire.

## Design

Faithful stadiametric wingspan ranging, anchored on the **target** — not on the lead line.

A second-model review (Codex) corrected an earlier plan that laid the funnel along the
`gunCross → leadPipper` line: `LeadPipper = muzzle + LeadDirection · range`, where
`LeadDirection` already bakes in lead + gravity, so it is a "fly the gun cross onto it"
marker. The **target is not on that line** — it trails the pipper by the lead angle — so a
funnel drawn along it would never touch the target's wings. The funnel must instead sit on
the target, where the wings actually are. This is period-authentic: the F-86 ranged by
framing the target's wingspan in the sight (manual/radar range), with a separate
lead-computing reticle — exactly the split we keep (funnel = range, pipper = lead).

1. **Anchor on the target.** Center the funnel on the projected `banditPosition`. The wings
   and the rails are in the same place, so the pilot flies the target's wings into the walls
   directly — the classic passive funnel technique.
2. **Rails are a FIXED wingspan scale.** The rail half-width at range `r` is
   `focalPx · (wingspan/2) / r` (`gunFunnelSamples().halfWidthPx`), sampled across the
   effective envelope `[near, far]` — wide (near) to narrow (far). Crucially the width depends
   only on the wingspan and the range ladder, **not** on how big the target currently looks.
   The target's own apparent size is the independent variable the pilot reads against it.
3. **The pilot's eye does the comparison.** The funnel is a passive graphic; the rendered
   target's wings are what the pilot fits to the walls, exactly as a real funnel gunsight.
   This is deliberately simple — it needs no wingtip projection or aspect math, and the pilot
   judges deflection/aspect the way a real gunner does.
4. **Presentation vs. content.** The vertical spread (`HALF_BAND_PX`) is presentation; the
   rail *widths* are the calibrated content. Rails converge monotonically (narrow toward far).
5. **Colour = state, not geometry.** Green whenever inside effective range (the gate);
   brighten on the authoritative `visualGunSolution` (lead solved) so it reads as SHOOT.
   Not `gun_window` — that is only a coarse 800 m / 12° framing cone, not a firing solution.

### Why not size the rails from the measured apparent span

An earlier implementation sized each rail from the target's *measured* projected span
(`targetHalfPx · range/rangeM`) and anchored the ladder on the lead line. A two-model
adversarial review (Claude lenses + Codex, numerically reproduced) killed it:

- **Tautology.** With rails built from the measured span, the current-range rung equals the
  wings *by construction* at every range (`matchDelta = 0.0000` at 160/250/400/600/780 m) —
  it read out nothing, the same dead-scale defect as the original code.
- **Lead-axis flip.** Orienting the ladder along `gunCross → leadPipper` degenerates and
  flips 180° exactly at the gun solution, where `pipper → boresight`.
- **Off-axis aspect gate.** A projected-span-vs-slant-range ratio grew *more* permissive off
  boresight (`1/cos(offAxis)`), the opposite of the intent.

The fixed-scale passive funnel above avoids all three: fixed widths (no tautology), no
lead-axis dependence (no flip), no aspect math (the pilot judges aspect).

Set aside (over-engineering for a game): moving funnel-sample generation into the C#
ballistic solver, and reconstructing a per-range lead curve client-side.

### Known limitation

Distant targets are floored to an ~8–14 px readability contact (`banditContact` impostor),
so near the far edge of the envelope the rendered target is slightly larger than its true
projected wingspan and reads as marginally closer than it is. The error is confined to the
outer ~100–150 m and errs toward engaging; matching the impostor's displayed size would
couple the HUD to render internals and is deferred.

### Range envelope from real ballistics (no magic fractions)

- `farRangeM  = min(EFFECTIVE_CEILING_M, velocity · min(maxFlightSeconds, EFFECTIVE_TOF_S))`
  with `EFFECTIVE_CEILING_M = 900`, `EFFECTIVE_TOF_S = 0.9`.
  → ~783 m at 870 m/s; 900 m at 1030 m/s. Responds to the gun.
- `nearRangeM = MIN_TRACKING_RANGE_M` (≈150 m) — a real minimum tracking/convergence floor,
  never above `farRangeM - a small margin`.

### "Only when usable" visibility gate

Pure predicate `gunFunnelUsable(state, envelope)` (unit-tested) requires **all**:

- `state.bandit_alive === true`,
- `state.lead_valid === true` (no solution → cage it, like a real gunsight),
- `state.target_wingspan_m > 0`,
- `nearRangeM ≤ state.range_m ≤ farRangeM` (inside the effective envelope; outside it the
  wingspan gate is off-scale).

`hud.js` additionally requires:

- fight HUD active (existing gate),
- the target projects in front of the camera.

Otherwise draw nothing.

## Module boundaries

`web/wwwroot/render/hud/gun_funnel.js` stays a pure, unit-tested module:

- `gunFunnelProfile(state)` → `{ muzzleVelocityMps, maximumFlightSeconds, targetWingspanM }`
  (unchanged contract).
- `gunFunnelEnvelope(profile)` → `{ nearRangeM, farRangeM }` from real ballistics.
- `gunFunnelSamples({ ...profile, focalLengthPx, sampleCount })` → rungs
  `{ rangeM, fraction, halfWidthPx }` across `[near, far]`. **No `yPx`, no
  `timeOfFlightSeconds`.** `fraction` (0 near → 1 far) is the caller's along-line
  parameter; screen placement lives in `hud.js`.
- `gunFunnelUsable(state, envelope)` → boolean gate (world-projection checks stay in
  `hud.js`, which combines this predicate with the in-front-of-camera tests).

`hud.js#drawGunFunnel` projects gun cross + lead pipper, runs the gate, and lays the rungs
along the lead line, with the target's own projected position as the thing the pilot flies
onto the rails.

## Testing

Rewrite `web/wwwroot/render/hud/tests/gun_funnel.test.mjs`:

- profile passthrough (kept),
- envelope: derived from ballistics, `far` responds to velocity, `near < far`, no clamp to
  the old 220/1180 constants,
- samples: `halfWidthPx` strictly decreasing with range; equals `focalPx·wingspan/(2r)`;
  bigger wingspan → wider gap at same range; range scale independent of wingspan; no `yPx`
  / `timeOfFlightSeconds` fields,
- `gunFunnelUsable`: true only inside the envelope with a live target + valid lead +
  known wingspan; false on dead bandit, invalid lead, zero wingspan, out-of-envelope range,
- production wiring: `hud.js` calls `drawGunFunnel` and gates on `lead_valid` /
  `bandit_alive`; bridge still emits the three authoritative fields.

`node --test` runs the module tests; `node --check web/wwwroot/hud.js` guards syntax; full
`bin/check` before done, plus the Build-NN stamp bump.
