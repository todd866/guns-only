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
| Leading edges, inlet lip, nozzle / aft tunnel | SiC/SiC-class CMC, authored 1200 °C material-capability surrogate | Survive M4 stagnation + hot gas |
| Primary airframe skins, tanks, cold structure | Ordinary composite | Mass and cost |
| Escape / sensor spine | Opaque composite | No glass canopy; thermal and ballistic shell |
| Tip accents | Paint / cool metal | Presentation only |

Closed repo number: `SkinTemperatureLimitK = 1473.15` (1200 °C) in
`FlightModel.RapierPublicDataSurrogate`. Despite the inherited property name, this is a
**CMC material-capability surrogate**, not a qualified whole-aircraft operating limit. No Rapier
inlet-lip, bondline, tank-wall, insulation, or cold-structure qualification curve exists.

Credibility path: CMC already flies in engine hot sections; printed CMC hot *airframe* structure is
a 2030s extrapolation, not magic — tagged **surrogate**, not real-world OEM data. NASA's
[SiC/SiC CMC durability review](https://ntrs.nasa.gov/citations/20180002984) supports the material
family, but does not qualify this fictional installation.

## Temperature channels — do not compare unlike locations

| Channel | Kernel / snapshot | Meaning |
| --- | --- | --- |
| Static ambient | atmosphere | Local freestream `T∞` |
| Stagnation `T0` | `AirData.StagnationTemperatureK` / `rapier_stagnation_temp_c` | Perfect-gas total-temperature upper bound where flow is stopped: `T∞(1 + (γ−1)M²/2)` |
| Recovery `Taw` | `AirData.AdiabaticWallTemperatureK` / `rapier_recovery_temp_c` | Turbulent flat-skin adiabatic-wall target, using recovery factor `r = 0.88` |
| Wall skin | `AircraftSim.SkinTemperatureK` / `rapier_skin_temp_c` | Lagged structural-wall surrogate driven toward `Taw` |
| CMC capability | `SkinTemperatureLimitK` / `rapier_cmc_capability_c` | Raw authored material capability; **not** an aircraft operating limit |

NASA Glenn gives the
[stagnation-temperature relation](https://www.grc.nasa.gov/WWW/BGH/stagtmp.html); NACA TN 2077
documents [laminar and turbulent recovery factors](https://ntrs.nasa.gov/citations/19930082751).
At M4 in the FL560–FL700 band the model therefore gives `T0 ≈ 637–642 °C` but flat-skin
`Taw ≈ 554–558 °C`. A lagged wall can be cooler during heat-up or hotter during a subsequent
deceleration. A low wall number is not a Celsius/Kelvin bug and should never be labelled `T0`.

The 1200 °C capability is screened conservatively against `T0` for Rapier's inlet lip and leading
edges, giving a current-condition material ceiling near **M5.37 at FL700** (the old flat-skin
recovery calculation gave ~M5.72). This is a diagnostic/failsafe ceiling, not the advertised dash
command and not evidence that the integrated airframe is qualified to M5.37.

There is deliberately **no 650 °C operating limit**. That number would only be the M4 `T0` result
rounded into a limit; no component qualification makes it one. Until inlet/bondline/cold-structure
curves exist, cockpit copy reports skin, `T0`, and CMC capability separately and says
**ENGINE/INLET LIMITING**.

## Transient-model uncertainty

The wall channel retains the Build 174 first-order heat/cool lags (12 s / 180 s). They are useful for
preventing instant fake-cooling in a dive but remain provisional. NASA's thin-skin treatment includes
areal heat capacity, local convective heat-transfer coefficient, emissivity/radiation, geometry, and
trajectory; see [NASA TP-2000-209034](https://ntrs.nasa.gov/citations/20010002830). Rapier has none
of those qualified inputs. Adding guessed radiation or heat capacity would create false precision;
radiation would generally lower equilibrium wall temperature, not explain why the old gauge looked
low.

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

The conservative CMC/T0 screen is ~M5.37 at FL700 while the flown energy ladder peaks around M3.6–3.7:
**engine/inlet binds first**. See [00 — Mission and flight regime](00-mission-and-ops.md).

## Epistemic

The M4 fiction and 1200 °C material-card value are closed repo decisions. The specific zone-by-zone
assignment is **surrogate** reasoning grounded in a real material family. Integrated component
temperature limits and the wall transient model remain **open/provisional**, not claimed OEM or
qualification data.
