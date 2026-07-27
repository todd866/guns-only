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
| Core SLS dry (airframe) | **85 kN** | Pulls through transonic; was 65 kN and stalled on the shoulder |
| Augmentor stop | 1.55 | Full wet on cat; dry launch decays below stall |
| Wet T/W (derived) | ~**1.39** gross / ~**2.0** alert | **Overperformance** vs Identity ≤1.20 — do not buff further |

Grounded in `sim/Propulsion/TurboRamjetPerformanceMap.cs` and `FlightModel.RapierPublicDataSurrogate`.
Measured intercept OFT energy-ladder peak Mach ≈ **3.69** (not 4.0).

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
| Gas budget | 40 kg peroxide-class |
| Burn | 0.40 kg/s at full | Enough for a few corrections per lob, not a spaceplane session |

## Known first-principles gap — open finding, do not paper over

**Fuel is still lever-only** in the propulsion map: the turbine can charge military fuel while
contributing no thrust. The aircraft's point — idle the core and cruise on the duct — is **not yet
instrument-true**. The fix is per-stream fuel accounting (separate work, not part of this bible's
freeze). This bible must show the *intended* fuel story; the sim's honesty tracks the open finding
until it is fixed. Do not implement a "fake" per-stream split here or in the JSON capture to make
this chapter look closed.

## Epistemic

The map constants are **closed** — they are the actual constants in
`TurboRamjetPerformanceMap.cs`, not invented for this bible. The per-stream fuel gap is an **open
finding**: it is a known place where the sim's fuel model does not yet match the propulsion
architecture described here.

