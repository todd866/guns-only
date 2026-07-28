# Rapier airframe — first-principles engineering + capture kit (design)

Status: Draft for re-review · 2026-07-27 · Approach C (full SE) + B (geometry-of-record kit as *capture*)

**Spine of this document:** mission → flight regime → geometry → materials/thermal → propulsion →
mass/CG → systems that follow. The Airframe Definition, blueprints, renderer, and future-jet
template exist to **capture** those decisions, not to lead them.

Supersedes, for airframe storytelling: the “cheap stainless / M2.6 as the aircraft” narrative in
`docs/2026-07-26-open-work-and-findings.md` and older setting prose that still describes a steel
skin limit. Companions (not replaced): `docs/rapier-gun-drone-system.md`,
`docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md`,
`docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md`,
`docs/2026-07-26-reclined-seat-and-ukraine-setting.md`, ADR-0003.

Numbers below are **surrogates** grounded in `FlightModel.RapierPublicDataSurrogate`,
`TurboRamjetPerformanceMap`, `createRapier`, and doctrine beats unless tagged `provisional` or
`fiction`.

---

## Goal

Answer, with explicit numbers and reasoning: what flight regime Rapier lives in, what geometry that
forces, what materials survive it, how the engine is arranged, how mass and fuel close the mission,
and which crew / weapons / basing systems follow. Then record those answers so blueprints, the
renderer, and the next jet cannot drift.

## Non-goals

- Treating schemas, registries, or mesh loaders as the product.
- Closing every open finding (per-stream fuel, full swarm kinematics) inside this design — they are
  named where they bite the first principles.
- Shipping AI stills as runtime SoT (ADR-0003).
- Claiming real-world OEM data.

## Authored freezes (engineering)

| Decision | Freeze | Why |
| --- | --- | --- |
| Dash | Mach 4 in thin air; tops out ~M4.5 on **thrust** | Mission egress + ram cycle fall-off |
| Hot structure | CMC ~1200 °C sustained (`SkinTemperatureLimitK = 1473.15`) | Stainless dies before M4 stagnation |
| Map `DesignMach = 2.6` | Engine **normaliser**, not airframe dash claim | Avoid silent thrust multiplication |
| Geometry | 13 m × 7.35 m span × 18 m² × AR 3 | High-speed wing, duct-dominated body |
| Mass | 5150 kg empty + 4500 kg fuel = 9650 kg | Interceptor fuel fraction, trap-light gear |
| Doctrine | One lunge, then recover | Sizing for the fight it picks |

---

# Part I — First principles

## 1. Mission and flight regime

### What the aircraft is for

Rapier is a **dispersed, land-based, guns-only interceptor**: launch from deep rear basing, climb
into thin air, dash to a high-slow formation, commit a single attack (ownship guns and/or gun-drone
release), then **egress and recover** rather than stay and turn. The name is doctrine: a thrust, not
a slash. Surviving the pass and hunting the recovery is how you beat one.

### Regime boxes (authored profile)

| Phase | Altitude (approx) | Mach / speed | Binding constraint |
| --- | --- | --- | --- |
| Catapult / gallery | buried → open 12° ramp | end ~110 m/s (~1.5–1.7 Vs at gross) | launcher energy, not wing area |
| Subsonic climb | → FL560 (~17 km) | ~M0.90 | turbine thrust through transonic; clean config |
| Transonic push | mid-high | M0.94 → ~M1.2 | wave-drag peak ~M1.18 (`WaveDragK` 20) — push through |
| Ram light → full | high | M2.0 → M2.8 | continuous TBCC overlap; density-gated inlet |
| Ram climb / dash | → FL700 (~21+ km) | → **M4** | thin air + ram; inlet schedule forbids low-alt M4 |
| Attack dive | descending | energy into gun/drone window | structure 12 G / override 15; thermal in dive |
| Egress | thin air | M4 | same dash box; drones screen pursuers |
| Return / shed | ~FL450 | ~M2 then decelerate | fuel reserve to trap |
| Marshal / wire | pattern → strip | approach / hook | recovery mass, not cat gross |

Briefing-aligned (fiction until each OFT gate): RAM LIGHT ~M1.6 presentation cue; full ram ownership
by ~M2.2–2.8 in the map; four square gates into wire three.

### Why Mach 4 thin-air dash

1. **Mission geometry:** deep basing needs high true airspeed to close and leave before a turning
   fight develops. Specific range at ram cruise is the point of the aircraft.
2. **Cycle honesty:** ram thrust falls as inlet total temperature approaches burner temperature
   (~2300 K). Group peaks near ~M3 and is dying by ~M5 → airframe tops out ~**M4.5 on thrust**.
3. **Right binding order:** CMC skin is good to ~M5.7 thermally; engine dies first. Thermal gauge
   is a **dive warning**, not a permanent ceiling. That is how a ramjet should behave.

### Thermal vs thrust ceiling

| Limit | Approx | What hits first |
| --- | --- | --- |
| Stagnation temp @ M4 | ~910 K (~637 °C) ambient-total class | Stainless already failed; CMC still has margin |
| Skin qualified | 1473 K (1200 °C) | Airframe thermal headroom |
| Ram cycle / spill | useful dash ~M4; spill band M3.3–3.8; dead by ~M4.5–5 | **Thrust** |
| Structure | 12 G qualified / 15 G override | Dive pull, not cruise |

**Decision locked:** accept Mach 4 and CMC (option 1 from open findings). Do not revert the airframe
story to stainless M2.6. Keep map `DesignMach = 2.6` as a normaliser so changing it does not
silently rescale thrust.

### Epistemic

Regime boxes and dash claim: **surrogate** (mission + params + map). Exact OFT altitudes may move
with guidance retunes; the *shape* of the profile does not.

---

## 2. Geometry

### Envelope (closed from mesh + params)

| Quantity | Value | Derivation / rationale |
| --- | --- | --- |
| Length | **13 m** | Fuselage loft `z ∈ [-6.5, 6.5]`; sensor fuselage name |
| Span | **7.35 m** | `WingSpanM = sqrt(AR 3.0 × 18 m²)`; planform tip ±3.675 m |
| Wing area | **18.0 m²** | High wing loading by choice |
| Aspect ratio | **~3.0** | Low-AR supersonic wing; `CLAlpha` 3.60 |
| Wing loading @ cat mass | **~436 kg/m²** | Cruise / dash beats low-speed sustained turn |
| Frontal / duct | ~duct-dominated | `RamCaptureAreaM2 = 1.2` — aircraft is substantially inlet, D-21-like |

### Why this planform

- **High wing loading:** the fight is a fast pass and a trap, not a sustained dogfight. Instantaneous
  G exists in a **fast, low box at the bottom of a dive**; after that the aircraft is slow, low, and
  out of ideas — by design.
- **Thin sharp wing:** `MCrit` 0.94, wave-drag peak ~M1.18, `WaveDragK` 20 — rise is real but meant
  to be **pushed through**, not used as a wall (contrast subsonic siblings walled ~M0.85).
- **Area-ruled body:** `CD0` 0.0175, `InducedK` 0.105 — slender OML, small high-speed wing;
  presentation loft is a pinched ellipse sequence, not a fat fighter fuselage.
- **Twin fins + tip accents:** directional stability at altitude; accents are readability, not
  stores.

### Inlet / nozzle placement (from `createRapier`)

| Feature | Placement (mesh frame) | Why |
| --- | --- | --- |
| Blended ventral inlet | ring ~r 0.29–0.55 at `(0, −0.22, −3.72)`, scaleY 0.72 | Single capture for TBCC; keep duct under spine |
| Propulsion tunnel | loft under belly −3.68 → 6.1 | Continuous core-bypass path; one nozzle |
| Exhaust | torus r~0.34 at `(0, −0.10, 6.12)` | Aft hot zone; CMC fairing |
| Opaque escape/sensor spine | loft above body, no canopy | No windscreen; crew behind sensors |

**Frame convention:** current Three.js Rapier space uses +Z aft (nose toward −Z). Capture kit must
document `frameConvention: "threejs-createRapier-v1"` so plates and JSON do not flip the aircraft.

### Planform seed (authoritative)

```text
[0,-3.8], [-0.74,-3.1], [-3.675,0.05], [-3.48,0.92],
[-1.04,0.46], [-0.72,3.5], [0,4.05], [0.72,3.5],
[1.04,0.46], [3.48,0.92], [3.675,0.05], [0.74,-3.1]
```

Thickness / camber params match `createPlanformGeometry(..., 0.16, 0.044)`. Fuselage and tunnel loft
stations copy `createRapier` exactly in Phase 1 — geometry first principles are already encoded
there; the kit freezes them.

### Gallery clearance check (basing ↔ geometry)

Span 7.35 m in a 14×8 m bore ⇒ ~2.7% blockage — deliberate: bore size beats vacuum. Geometry must
not grow span without revisiting the launcher.

---

## 3. Materials and thermal

### The stainless dead-end (superseded)

Stagnation at M4 is ~910 K. Stainless loses strength by ~600 °C. A “cheap steel + composite”
Rapier at M4 is incoherent. MiG-25-class steel tops out nearer M2.8–3.1. **That story is retired.**

### CMC hot structure (authored)

| Zone | Material | Role |
| --- | --- | --- |
| Leading edges, inlet lip, nozzle / aft tunnel | SiC/SiC-class CMC, ~1200 °C sustained (margin under ~1300 °C class) | Survive M4 stagnation + hot gas |
| Primary airframe skins, tanks, cold structure | Ordinary composite | Mass and cost |
| Escape / sensor spine | Opaque composite | No glass canopy; thermal and ballistic shell |
| Tip accents | Paint / cool metal | Presentation only |

Credibility path: CMC already flies in engine hot sections (e.g. LEAP shrouds); printed CMC hot
*airframe* structure is a 2030s extrapolation, not magic — tagged **surrogate**.

### What heat forces on the design

1. **Leading edges and inlet:** CMC or they do not dash at M4.
2. **Duct / nozzle:** hot fairing materials; no thrust-vector actuators in the hot path (see §4).
3. **Crew capsule:** sealed opaque pod — no windscreen heat load, no pilot eyeball on shock; sensors
   and automation own the outside world.
4. **Drone release:** drone skin envelope is cooler than Rapier dash; release waits for a compatible
   band (glide-drone vertical slice) — do not spawn melting airframes.
5. **Cost:** CMC premium already implied (~2% structural life at $180k → ~$9M airframe class). Ledger
   must not pretend stainless flyaway.

Thermal headroom to ~M5.7 on skin vs ~M4.5 on thrust → **engine binds first**.

---

## 4. Propulsion architecture

### Claim

One inlet, one nozzle, **core-bypass turbo-ramjet** (TBCC / J58-like principle): turbine keeps
running while bypass into a ram combustor grows with Mach. **There is no hard engine swap** — a
failed light-off of a separate ramjet would leave a heavy glider. Continuity *is* the safety case.

### Streams and handover (map constants)

| Constant | Value | Meaning |
| --- | --- | --- |
| Turbine fade | M1.9 → M3.0 | Core unloads as inlet gets too hot |
| Ram light → full | M2.0 → M2.8 | Overlaps turbine fade (repeatable shove) |
| Burner temperature | 2300 K | Chemistry-limited; not 3000 K fantasy |
| Capture area | **1.2 m²** | Physical duct; thrust from ideal cycle, not a fitted top speed |
| Density schedule | locked dense → open thin | **Climb before accelerating** is structural to the inlet |
| Spill | M3.3 → M3.8 | Translating inlet dumps over-capture |
| Design point | M2.6 @ 21.5 km | **Normaliser only** |
| Core SLS dry (airframe) | **85 kN** | Pulls through transonic; was 65 kN and stalled on the shoulder |
| Augmentor stop | 1.55 | Full wet on cat; dry launch decays below stall |

### Why no thrust vectoring

Hot actuators, mass, maintenance, cost. Pitch/roll authority is aerodynamic + FBW. At collapsed
dynamic pressure (exo coast / zoom lob), **cold-gas RCS** takes the stick:

| RCS | Value |
| --- | --- |
| Max moment | 220 kN·m |
| Gas budget | 40 kg stored inert-gas equivalent; bottle/compressor trade remains open |
| Burn | 0.40 kg/s at full | Enough for a few corrections per lob, not a spaceplane session |

Do not call peroxide “cold gas.” The next systems trade should compare a ground-charged
nitrogen/helium-class accumulator with compressor top-up against a genuinely hot-gas
monopropellant system. Ram capture still requires compression, drying, cooling, and storage, and
cannot refill the bottle during the collapsed-q coast. The later training/OFT slice should model
pressure, temperature, leaks, stuck valves, delivered moment, and an NF-104A-style tumble/ejection
case after an incorrect lob entry or RCS depletion.

### Known first-principles gap (do not paper over)

**Fuel is still lever-only** in the map: turbine can charge military fuel while contributing no
thrust. The aircraft’s point — idle the core and cruise on the duct — is not yet instrument-true.
Fix is per-stream fuel (separate work). SE bible must show the intended fuel story; sim honesty
tracks the open finding.

---

## 5. Mass, CG, and fuel fraction

### Closed mass statement

| Item | Mass | Note |
| --- | --- | --- |
| Fuel-free | **5150 kg** | Structure, systems, pod, empty tanks |
| Max fuel | **4500 kg** (~9920 lb) | Capacity |
| Gross | **9650 kg** | `MassKg` |
| Fuel fraction | **~47%** | Was 34% (fighter fraction) — too short for interceptor leg |
| Alert launch fuel | **3100 lb** (~1406 kg) | Intercept beat: narrow trap reserve, not free cruise |
| Bingo / min / emerg | 1000 / 600 / 300 lb | Doctrine thresholds |

SR-71-class fraction is ~59%; 47% is “what this profile needs,” not mimicry.

### Why the weight is affordable

Every landing is an **automation-assisted trap**. Launch heavy off the catapult; arrive light. Gear
and wire see **recovery weight**, not cat gross. That single basing choice unlocks interceptor fuel
fraction on a small airframe.

Cat end speed ~110 m/s remains ~1.5+ Vs at gross — flying off the rail, not clinging.

### Wing loading and “G”

436 kg/m² at cat mass: **cruise wins**. Instantaneous structural G (12 / 15) is for the dive pass,
not for a turning war at altitude. Opponent doctrine: survive the pass, then hunt.

### CG / stores (provisional where unclosed)

| Condition | CG intent |
| --- | --- |
| Empty | forward of aft duct mass; spine/crew mid-forward |
| Alert fuelled | fuel stations keep CG in FBW envelope |
| After drone release | aft or mid bay empty — **provisional**; packaging trade owns travel |
| Near bingo | light, recovery CG |

Ownship ammo (480 rounds): small vs fuel; mass unclosed but second-order. Gun-drone load (0–4):
**packaging unclosed** — gameplay says four; engineering mass/volume still provisional.

Inertias in params (`Ixx` 9.5e3, `Iyy` 6.2e4, `Izz` 6.8e4) are geometry-derived for ~13 m / 7.3 m /
~7.85 t class — keep consistent with OML revisions.

---

## 6. Systems that follow from the above

First principles cascade; these are not optional cosmetics.

### Crew, escape, FBW

- **No windscreen** → reclined occupant in opaque composite escape pod; sensors + automation fly.
- **Structure binds before upright hydrostatic pilot limits** →
  `PilotPhysiologyProfile.RapierReclinedInterceptor` must not silently re-impose seat-up limits
  (keep that open finding visible).
- **Keyboard flyability is fiction of the same thesis:** firm bank-hold FBW
  (`RollHoldRateGainNms` 1.2e6) + narrow gunnery aim assist (does not create lift/thrust/hits).
- Escape pod jettison: interface only until a beat needs it (**provisional**).

### Armament and drones

- Ownship guns-only, 480 rounds — one pass, not a magazine war.
- Four reusable gun-drones are the **gameplay** load; physical packaging (cells, doors, thermal
  soak, CG, release envelope at dash Mach) remains the open SE trade. Constraints from §§2–3:
  - Cells must live inside the area-ruled body without wrecking wave drag.
  - Release Mach/altitude must respect **drone** skin limits, not only Rapier CMC.
  - Pickup is off Rapier’s arresting strip (glide-drone design).
- Vertical slice owns first physical drone; this SE owns packaging envelope for geometry.

### Landing gear, arrest, basing

- Catapult: 520 m rail stroke, ~110 m/s, 433.86 m flat gallery + 86.14 m arc to
  **12°**, R=411.29 m, rise ~8.99 m at 3 G. The earlier 360+160 m / 16.7 m line
  was the superseded 150 m/s study, not the live launcher.
  rail normal — angle from aircraft capability and pilot load, not from Ukrainian hills.
- Hook recovery on purpose-built land strip (`ProvisionalRapierLandStrip`).
- Buried tube: crater-proof dispersed basing; bore 14×8 m sized for span clearance, not vacuum.
- Ukraine corridor theatre; no maritime presentation.

### Power / avionics (qualitative → Phase 2 watts)

Driven by: sensor spine, FBW, environmental conditioning for drone cells, cold-gas storage,
clinical capsule displays (cold instruments vs soft world — ADR-0003). Phase 1: interfaces; Phase 2:
power budget table.

### Failure modes that matter because of the regime

| Failure | Why first-principles care |
| --- | --- |
| Inlet unstart / spill | TBCC in thin air |
| Thrust hole in handover | Overlap band is the aircraft’s defining moment |
| Skin overtemp in dive | CMC margin vs thrust-first ceiling |
| Bank-hold loss | Occupant cannot hand-fly the thesis |
| Drone bay hang | Asymmetric + release inhibit |
| Hook miss / bolter | Fuel fraction assumes trap |
| RCS empty on lob | Elevons dead at low q |

### Cost (consequence of CMC + duct)

Flyaway assumes CMC premium (~$9M-class comment already in params). Stainless counterfactual is a
ledger row for “aircraft we refused,” not the product.

---

# Part II — Capture mechanism (jet kit)

Infrastructure exists so Part I cannot evaporate into scattered comments and a one-off mesh.

## 7. What gets captured

```text
Part I decisions  →  Airframe Definition JSON  →  blueprints + definition-driven mesh
                  →  SE bible chapters (reasoning + budgets)
                  →  sim identity bind (params / presentation id)
                  →  Ghibli refs (mood only; ADR-0003)
```

**Identity:** one `airframeId` (e.g. `rapier.public-data-surrogate.v1`) shared by definition,
`presentation.vehicle.rapier.public-data-surrogate.v1`, and `FlightModel.RapierPublicDataSurrogate`.
Kernel owns physics; definition owns OML and sockets; bible owns *why*.

### Directory (capture, not the story)

```text
airframes/rapier.v1.json          # geometry-of-record from §2
airframes/schema/...              # validates capture
docs/airframes/rapier/            # SE chapters following §1–6 order
docs/airframes/rapier/blueprints/ # plates generated/authored from JSON
analysis/art-refs/rapier/         # fiction-tagged stills
```

Chapter order in the bible **matches Part I**: mission → geometry → thermal → propulsion → mass →
crew → armament → landing → basing → FMECA → cost → ICDs. Do not lead the bible with “schema.”

## 8. Airframe Definition (minimal fields that encode Part I)

Must be able to round-trip §2 geometry and §3 material zones:

- `dimensionsM`, `wing` (area, AR, planform polyline), fuselage / spine / tunnel lofts, intake,
  exhaust, fins, sockets (camera, muzzles, hook, droneBay[0..3] provisional, cg stations)
- `materialZones` (CMC hot vs composite cold vs sensor spine)
- `presentationId`, `flightModelBinding`, `epistemic`, `frameConvention`
- `systemsArrangement` bay volumes (provisional OK)
- `palette` tokens (Ghibli may retint without moving OML)

Rapier v1 JSON is a **1:1 migration** of `createRapier` numbers plus span/area/mass from params —
no silent redesign.

## 9. Blueprints (engineering drawings of Part I)

Plates cite `id` + `revision`. Source of numbers = definition only.

| Plate | Shows |
| --- | --- |
| 01 Three-view | 13 m / 7.35 m envelope |
| 02 Wing planform | Polyline, area, AR, loading |
| 03 Loft stations | Fuselage sections |
| 04 Inlet / duct / nozzle | 1.2 m² capture story |
| 05 Escape spine | Opaque crew volume |
| 06 Systems arrangement | Fuel, gun, bays |
| 07 Drone cells | Provisional 2–4 options |
| 08 Thermal zones | CMC vs composite map |
| 09 Gear / hook | Recovery geometry |
| 10 Basing interface | Gallery clearance, 12° ramp |

Phase 1: hand SVG from JSON numbers OK; generator later if painful. Acceptance: rebuild mesh from
plates + JSON without reading `scene_builders.js`.

## 10. Definition-driven renderer

`createAirframeFromDefinition` uses existing loft/planform helpers. `createRapier` becomes a thin
loader. Golden test: sockets/bbox match today’s mesh. Missing required geometry → refuse spawn (no
silent bandit mesh). Palette may follow Ghibli refs; OML only changes on revision bump.

## 11. Sim binding

| Concern | Binding |
| --- | --- |
| Presentation | `presentation.vehicle.rapier.public-data-surrogate.v1` |
| Params | `FlightModel.RapierPublicDataSurrogate` |
| Propulsion | `TurboRamjetPublicDataSurrogate` + map §4 |
| Physiology | `RapierReclinedInterceptor` |
| Arrest / cat | land strip + 520 m / 110 m/s / 12° ramp |
| Fuel card | capacity 9920 lb; alert 3100 lb |

CI (Phase 2): fail if definition span/area/length diverge from params.

## 12. Ghibli viz (after engineering, not instead)

Weathered mechanical honesty, opaque spine, buried-strip reveal, soft world / cold instruments.
Refs under `analysis/art-refs/rapier/` with provenance; `epistemic: fiction`. They inform palette
tokens, not OML.

## 13. Future jets

Copy template → fill **Part I first** (regime, geometry, materials, propulsion, mass) → then JSON
and plates. Register presentation → definition builder. Bespoke `createFoo` only with an explicit
exception note when the loft schema cannot express the OML.

## 14. Phased delivery

| Phase | Engineering outcome | Capture outcome |
| --- | --- | --- |
| **1** | Freeze §§1–5 numbers in bible; provisional §6 trades named | JSON 1:1 from mesh; plates 01–05, 08, 10; renderer wrapper; art-ref folder |
| **2** | Close drone packaging, CG travel, power watts, cost ledger | Update sockets/bays; revision bump; binding tests |
| **3** | Second airframe through Part I | Proves kit; optional plate tool |
| **4** | Optional | Retire procedural-only path |

Phase 1 must not stall on full FMECA or drone mass — but it **must** state regime, geometry,
materials, propulsion, and mass with numbers.

## 15. Testing / acceptance (engineering-first)

- [ ] Bible §§1–5 readable without opening JSON schema docs.
- [ ] Mach-4 + CMC freeze and stainless supersession explicit.
- [ ] Map `DesignMach` 2.6 called out as normaliser, not dash.
- [ ] Geometry table matches `FlightModel` + `createRapier`.
- [ ] Definition ↔ mesh golden test.
- [ ] Plates cite revision; duct area 1.2 m² appears on propulsion plate.
- [ ] Per-stream fuel and drone packaging called out as open, not solved.
- [ ] Briefing does not claim closed drone engineering.

---

## Grounding index

| Topic | Location |
| --- | --- |
| Params / doctrine comments | `sim/FlightModel.cs` `RapierPublicDataSurrogate` |
| Propulsion map / duct area | `sim/Propulsion/TurboRamjetPerformanceMap.cs` |
| Mesh OML | `web/wwwroot/render/scene/scene_builders.js` `createRapier` |
| Fuel / cat / ammo | `sim/Doctrine/Beats.cs` `RapierIntercept` |
| Buried strip | `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` |
| Stainless vs M4 finding | `docs/2026-07-26-open-work-and-findings.md` |
| Gun-drones | `docs/rapier-gun-drone-system.md` + glide-drone design |
| Reclined thesis | `docs/2026-07-26-reclined-seat-and-ukraine-setting.md` |
| Art | ADR-0003 |

---

## Open questions (defaults)

1. **Four provisional drone sockets in Phase 1 geometry?** Yes — match gameplay load; label
   provisional until packaging trade closes mass/volume.
2. **Hand SVG vs generator in Phase 1?** Hand SVG from JSON.
3. **Runtime JSON path?** Copy/publish into `web/wwwroot/airframes/` for fetch/bundle.

---

## Spec self-review

- Part I leads; Part II is explicitly a capture mechanism.
- Mach-4/CMC vs map normaliser distinguished; stainless superseded with thermal reasoning.
- Geometry and propulsion numbers tied to concrete repo constants (18 m², 1.2 m² duct, 85 kN, etc.).
- Unclosed items (drone mass, per-stream fuel, pod escape) tagged provisional / open — not filled
  with fake precision.
- Infrastructure sections shortened to what is required to freeze Part I.
