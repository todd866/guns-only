# 30 — Propulsion and inlet

← [20 — Thermal and materials](20-thermal-and-materials.md) · Next: [40 — Mass and CG](40-mass-and-cg.md)

## Claim

One inlet, one nozzle, **core-bypass turbo-ramjet** (TBCC / J58-like principle): the turbine keeps
running while bypass into a ram combustor grows with Mach. **There is no hard engine swap** — a
failed light-off of a separate ramjet would leave a heavy glider. Continuity *is* the safety case.

## Streams and handover (map constants — closed)

| Constant | Value | Meaning |
| --- | --- | --- |
| Turbine fade | M1.9 → M3.0 | Core unloads as inlet gets too hot |
| Ram light → full | M2.0 → M2.8 | Overlaps turbine fade (repeatable shove) |
| Burner temperature | 2300 K | Chemistry-limited; not a 3000 K fantasy |
| Capture area | **1.2 m²** (`RamCaptureAreaM2`) | Physical duct; thrust from ideal cycle, not a fitted top speed |
| Density schedule | locked dense → open thin | **Climb before accelerating** is structural to the inlet |
| Spill | M3.3 → M3.8 | Translating inlet dumps over-capture |
| Design point | **M2.6 @ 21.5 km** (`DesignMach`, `DesignAltitudeM`) | **Normaliser only** — see below |
| Core SLS dry (airframe) | **84 kN** | Sized so aug T/W ≤ 1.20 at design gross (was 85 kN / clean 9650 kg → ~1.39) |
| Augmentor stop | 1.55 | Full wet on cat; dry launch decays below stall |
| Wet T/W (derived) | **≤ 1.20** at design gross | Family / Identity cap; alert (light fuel) still hotter |

Grounded in `sim/Propulsion/TurboRamjetPerformanceMap.cs` and `FlightModel.RapierPublicDataSurrogate`.
Measured intercept OFT energy-ladder peak Mach ≈ **3.69** (not 4.0).

Installed thrust is no longer the zero-incidence deck value at every attitude. Above M2, the
Rapier-only inlet surrogate reduces both reported and applied thrust with combined flow angle
`sqrt(alpha² + beta²)`. The cockpit publishes inlet recovery and calls low recovery/distortion.
Fuel flow remains commanded-cycle flow, so an abusive pull can waste fuel while losing net thrust.
See [12 — Aerodynamics and control allocation](12-aerodynamics-and-controls.md).

### `DesignMach = 2.6` is a normaliser, not a dash claim

The performance map centres its ideal-cycle group on `DesignMach` to normalise thrust to a sane
reference point. **This is not the airframe's top speed** — the airframe dashes at Mach 4 (see
[00 — Mission and flight regime](00-mission-and-ops.md)). Moving the normaliser once silently
rescaled thrust across the whole envelope and produced zero thrust by M2.78 when it was wired to the
same constant as the inlet spill Mach — that bug is why spill (M3.3–3.8) and the design point (M2.6)
are now separate constants. Do not re-couple them.

## Why no thrust vectoring

Hot actuators, mass, maintenance, cost. Pitch/roll authority is aerodynamic + FBW (see
[50 — Crew, escape, FBW](50-crew-escape-fbw.md)). At collapsed dynamic pressure (exo coast / zoom
lob), **cold-gas RCS** takes the stick:

| RCS | Value |
| --- | --- |
| Max moment | 220 kN·m |
| Gas budget | 40 kg stored inert-gas equivalent; architecture trade open |
| Burn | 0.40 kg/s at full | Enough for a few corrections per lob, not a spaceplane session |

### RCS architecture and upset-recovery work (open)

The kernel currently closes only moment authority, gas mass, consumption, and the aerodynamic/RCS
handover. It does **not** yet claim a bottle, compressor, valve, or thruster architecture.

The lightest credible baseline to study is a ground-charged high-pressure inert-gas accumulator
(nitrogen or helium-class), optionally topped up at useful dynamic pressure by an engine-driven
compressor. “Ram-air refill” is not free: captured air still has to be compressed, dried, cooled,
and stored, and it cannot refill the system during the collapsed-q part of the lob where RCS is
needed most. A peroxide monopropellant system would improve impulse density but would be hot-gas
RCS, with different handling, materials, signatures, and failure modes; it must not be described as
cold gas.

Future simulation should expose bottle pressure/temperature, compressor availability, valve and
jet health, propellant leakage, commanded versus delivered moment, and control allocation. The
training case is an NF-104A-style high-altitude loss of attitude control: enter the coast outside
the recoverable corridor, exhaust or lose RCS, depart into a flat tumble, then either recover as
dynamic pressure returns or meet the ejection envelope. That belongs in a later failure-mode/OFT
slice, not the Build 175 audio correction.

## Fuel accounting (closed in kernel — Build 163)

**Per-stream fuel** is owned by `TurboRamjetPerformanceMap.Evaluate`: turbine flow uses the
published idle/military/afterburner SFC against **turbine** thrust (idle floor while the core can
breathe); ram flow uses `RamTsfcRelativeToDryMilitary` against **ram** thrust. HUD
`rapier_turbine_fuel_ppm` / ram counterparts read those kernel fields — not a thrust-share of total.
The intended story (idle the core, cruise on the duct, watch flow drop) is now instrument-true at
the map level; mission fuel anchors remain surrogates until a component deck replaces them.

## Epistemic

The map constants and per-stream fuel split are **closed** in
`TurboRamjetPerformanceMap.cs`. Mission-level burn calibration (alert load → trap reserve) remains
a **surrogate**.
