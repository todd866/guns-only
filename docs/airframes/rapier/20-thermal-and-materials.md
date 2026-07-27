# 20 — Thermal and materials

← [10 — Geometry](10-geometry.md) · Next: [30 — Propulsion and inlet](30-propulsion-and-inlet.md)

## The stainless dead-end (superseded)

Stagnation at M4 is ~910 K. Stainless loses strength by ~600 °C. A "cheap steel + composite" Rapier
at M4 is **incoherent**. MiG-25-class steel tops out nearer M2.8–3.1. **That story is retired.** It
survives only as design history in `docs/2026-07-26-open-work-and-findings.md` and the older setting
prose in `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` and
`docs/2026-07-26-reclined-seat-and-ukraine-setting.md` — those documents predate this decision.

## CMC hot structure (authored — surrogate)

| Zone | Material | Role |
| --- | --- | --- |
| Leading edges, inlet lip, nozzle / aft tunnel | SiC/SiC-class CMC, ~1200 °C sustained (margin under ~1300 °C class) | Survive M4 stagnation + hot gas |
| Primary airframe skins, tanks, cold structure | Ordinary composite | Mass and cost |
| Escape / sensor spine | Opaque composite | No glass canopy; thermal and ballistic shell |
| Tip accents | Paint / cool metal | Presentation only |

Closed number: `SkinTemperatureLimitK = 1473.15` (1200 °C) in `FlightModel.RapierPublicDataSurrogate`.

Credibility path: CMC already flies in engine hot sections (e.g. LEAP shrouds); printed CMC hot
*airframe* structure is a 2030s extrapolation, not magic — tagged **surrogate**, not real-world OEM
data.

## What heat forces on the design

1. **Leading edges and inlet.** CMC or the aircraft does not dash at M4. This is not a cosmetic
   material choice — see [10 — Geometry](10-geometry.md) for where the CMC zones sit on the mesh.
2. **Duct / nozzle.** Hot fairing materials; no thrust-vector actuators in the hot path (see
   [30 — Propulsion and inlet](30-propulsion-and-inlet.md)).
3. **Crew capsule.** Sealed opaque pod — no windscreen heat load, no pilot eyeball on shock; sensors
   and automation own the outside world (see [50 — Crew, escape, FBW](50-crew-escape-fbw.md)).
4. **Drone release.** Drone skin envelope is cooler than Rapier dash; release waits for a compatible
   band (glide-drone vertical slice) — do not spawn melting airframes. See
   [60 — Armament and drones](60-armament-and-drones.md).
5. **Cost.** CMC premium already implied (~2% structural life at $180k → ~$9M airframe class). The
   ledger must not pretend a stainless flyaway cost — see [95 — Cost ledger](95-cost-ledger.md).

Thermal headroom to ~M5.7 on skin vs ~M4.5 on thrust → **engine binds first**. See
[00 — Mission and flight regime](00-mission-and-ops.md) for the full thermal-vs-thrust table.

## Epistemic

The Mach-4/CMC freeze is **closed**. The specific zone-by-zone material assignment and the ~1300 °C
class margin are **surrogate** engineering reasoning grounded in a real material family (SiC/SiC
CMC), not claimed real-world OEM data for a specific aircraft.

