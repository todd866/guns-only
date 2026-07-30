# The buried launch tube, and siting the Rapier in Ukraine

> **Historical design record — numerical launch study superseded.** The live launcher is now
> **520 m at 110 m/s**, with **433.86 m flat + 86.14 m open arc**, a **411.29 m** radius,
> **8.99 m** rise, **12°** release, and a **9.4545 s** stroke with **3,600 lb** alert fuel. The
> 150 m/s, 360 m + 160 m, 765 m radius, 16.7 m rise, 6.93 s, 88.3 MJ, 416-frame, and ~50,000 m³
> values below are retained only to show the design path; do not reuse them. The durable live,
> engineering, cost, safety, and hybrid generated-plate basis is
> [`airframes/rapier/82-launch-gallery-engineering-basis.md`](airframes/rapier/82-launch-gallery-engineering-basis.md).
> Burial can reduce exposure but is **not crater-proof**.

Design record for the work that started from a one-line bug report — "right now I'm taxying
through aircraft" — and ended up rebuilding where the aircraft lives and what launches it.

Companion to `2026-07-26-reclined-seat-and-ukraine-setting.md`, which established the aircraft and
the setting. This one establishes the ground.

---

## 1. The bug, and the two bugs underneath it

Beat 10 (`Beats.RapierIntercept`) is documented as "a land-based dispersed strip rather than a
ship". It constructs a `GunsOnly.Sim.Carrier`, so the renderer drew `createCarrier()` — an
Essex-class hull, island, funnel, lattice mast, radar yard, deck-edge catwalks, LSO platform,
water wakes, spray, and three parked aircraft. All of it hovering at 20 m on a hillside.

The geometry was worse than the look:

| | value |
|---|---|
| Deck length | 300 m |
| Catapult stroke | 520 m |
| Shuttle start | +20 m along |
| Parked aircraft (`scene_builders.js:437`) | 70, 91, 104 m along the run |

The shuttle started 20 m aft of centre, dragged the aircraft through all three parked aircraft,
left the bow at 150 m, and completed the remaining **390 m of its stroke in open air**.

Underneath that sat a worse one. Beat 10 reused `CarrierTerrainPlacementEastM = 100_000` from the
carrier beats. For a *ship* that is correct — off-grid means open ocean. But the Korea grid spans
±65,536 m, so sampling at −100,000 m east put the "dispersed strip" **34.5 km outside the terrain
entirely**. Every `TrySample` returned false. The code comment claiming "a coastal shelf at a known
elevation" was wrong: there was no shelf, no elevation, and no ground. A carrier floating over
nothing, off the edge of Korea.

**Lesson worth keeping:** copying a placement constant from a superficially similar beat carried a
semantic that did not transfer. Off-grid means *ocean*, which is right for a boat and catastrophic
for an airfield. The comment I wrote at the time asserted a fact I had never checked.

---

## 2. Ukraine is flat, and that broke the design

The setting moved to Ukraine. The launch design at that point assumed terrain would supply the
7 degree launch angle — "you can drive it at a big hill somewhere".

Ukraine does not have the hill. The theatre AOI tops out around 200–370 m in the Donets uplands
and is mostly 50–200 m of rolling steppe. A 7 degree ramp over the 560 m run needs 69 m of rise in
560 m, a 12% grade sustained for over half a kilometre. That does not exist there, and inventing it
would have meant either faking the terrain or siting the base somewhere the fiction did not want it.

A survey of the Korea grid had already shown how tight this constraint is: requiring a flat run, a
clear 7 degree climb-out, a clear 3.5 degree approach for the trap, **and** a lateral shelf for the
recovery strip returned exactly **one** viable site in 131 km². On flat steppe it returns none.

---

## 3. Bury it — and the geometry the kernel forces

The answer is to put the launcher underground: a cut-and-cover tube below grade, exiting through a
portal into an open cutting. It removes the terrain dependency completely, and it is a *better*
answer to the premise that created this aircraft. Forward airfields get cratered, which is why the
basing is deep. This record originally claimed that a buried launcher could not be cratered and
could simply be dug anywhere. **That absolute claim is withdrawn:** burial can reduce exposure, but
portal attack, ground shock, collapse, flooding, geology, utilities, and repairability still govern
survivability and siting.

### The kernel decided the shape — until it was told to decide differently

`CatapultLaunchModel.StrokeState` held the aircraft at constant deck height, pitch 0.8 degrees, with
no vertical motion, for the *entire* stroke, going airborne only at the end at
`AirborneHeightM = 4.0` with velocity split along the ramp angle.

That fact produced two wrong answers before it produced a right one.

**The parallel session's answer** was a 32 m, seven-degree terminal ramp on the rail, "which rises
almost exactly the projected four-metre handoff height". It does not: the aircraft stayed level and
flew straight through the last 32 m of its own rail.

**My answer** was to make the rail dead flat to match, and call the seven degrees a "departure
angle". That was rationalising a limitation instead of fixing it, and it was correctly called out:
*"give it a reasonable launch angle, don't be lazy about designing it properly."*

**The right answer** was to fix the kernel. `StrokeState` now models the ramp as a constant-radius
arc and flies the aircraft along it — height, attitude and velocity direction all follow the rail.
`RampNormalG = 3.0` sets the radius from the launch speed, so the geometry is derived rather than
authored, and `RampRiseM` is zero for a flat deck, which keeps every carrier beat bit-for-bit
identical. All 62 carrier and catapult tests passed unchanged.

The rule still holds, just pointed the other way: *the presentation is not free to be more correct
than the kernel — so if the better physics is worth having, put it in the kernel.*

### Choosing the angle from the aircraft, not from the terrain

Once the ramp is a built structure rather than a hill, the angle should be chosen by what the
aircraft and the pilot can take. At 150 m/s this jet **sustains a 47.7 degree climb**:

| | |
|---|---|
| Thrust (42 kN dry × 1.55 augmentor stop) | 65 kN |
| Drag at C_L 0.310 | 8.1 kN |
| Weight | 77 kN |
| **Sustainable climb angle** | **47.7°** |

So the jet was never the limit — the arc is. **Twelve degrees**, the same angle Kuznetsov and
Invincible use:

| | |
|---|---|
| Arc radius at 3 G normal | 765 m |
| Arc length / horizontal extent | 160 m / 159 m |
| Rise | **16.7 m** |
| Flat run before the arc | 360 m |
| Combined pilot load √(2.21² + 3²) | **3.73 G** (airframe rated 12) |
| Potential energy gained | 1.29 MJ of 88.3 MJ = 1.5% |

### Final geometry

| | |
|---|---|
| Stroke | 520 m from +20 m along, cross −7 m |
| Acceleration | 21.63 m/s² = **2.21 G** |
| Duration | **6.93 s** total, **5.8 s** of it enclosed |
| Rail | 360 m flat, then a 160 m arc to 12° |
| Gallery | roofs the **flat run only** — the ramp is ridden in the open |
| Gallery bore | 14 × 8 m internal, berm crest +10 m |
| Aircraft span (AR 3.0, S 18 m²) | 7.35 m → **2.7% blockage** |
| Interior ribs / vents | every 10 m / every 40 m |
| Handoff | ramp top, `AirborneHeightM + RampRiseM` = 20.7 m |

Roofing only the flat section is both the better reveal — dark, strobing, then daylight at the foot
of the jump — and far easier to build than roofing a curve.

---

## 4. The vacuum, arithmetically

The tube invites an obvious question: evacuate it? Constant-acceleration stroke gives
a = v²/2L, so v² = 2ax and drag rises linearly with distance:

    D(x) = C_D · ½ρ · v(x)² · S = C_D · ρ · a · S · x
    ∫₀ᴸ D dx = C_D · ρ · a · S · L² / 2

With C_D0 = 0.0205 (M0.44, below M_crit, no wave drag), ρ = 1.225, a = 21.63, S = 18, L = 520:

| | |
|---|---|
| Launch energy ½mv² | **88.3 MJ** |
| Air drag over the stroke | **1.32 MJ** |
| **Fraction** | **1.5%** |

A linear motor loses 10–15% to its own inefficiency. **The air in the tube costs a tenth of what
the motor already wastes.** Recovering it means a vacuum-tight 520 m structure with a door that
opens fully in under a second and re-pumping between shots. Not a trade anyone would make.

What *does* matter is **bore size, not pressure**. The bore holds ~46 tonnes of air, and a
close-fitting tube would have to accelerate a real share of it — that is a pneumatic cannon, not a
launcher. At 14 × 8 m the aircraft's ~3 m² frontal area is **2.7% blockage**, which behaves like
free air. Vent slots down the length relieve any residual piston effect for almost nothing.

**So: generous bore plus vents, never a vacuum.** The intuition that the vacuum "isn't very
efficient" was right, and the reason is that it is optimising the smallest term.

---

## 5. The tube is a loading corridor — the biggest win, and it was free

The stroke takes **6.93 s**. At 60 fps that is **416 frames** in which the only thing on screen is
tube wall and light ribs. The terrain worker pool is `hardwareConcurrency − 2`
(`korea_terrain.js:869`), so ~6 on a typical laptop, and at the measured 9.5 ms LOD0 chunk build
cost that window fits roughly **4,300 chunk builds** — the entire visible world many times over.

Three properties make it better than a generic loading screen:

1. **The window is deterministic.** The kernel owns the stroke, so the budget is identical every
   launch and can be relied upon rather than guessed at.
2. **Nothing competes for the frame.** Tube walls are a handful of draw calls, so nearly the whole
   budget goes to streaming — which is never true of the deck start, where the player sits in the
   open watching terrain assemble.
3. **The destination is known in advance.** The beat fixes the site, the heading and the 7 degree
   climb-out vector, so the renderer does not stream reactively; it builds precisely the chunks
   that will be in frame at exit, in priority order.

And the exit is the reveal: bursting out of the ground at 150 m/s into a finished world is a better
moment than a progress bar, and it is earned.

> ⚠️ **Hard constraint: the tube must never wait for the loader.** The kernel releases the aircraft
> at 6.93 s whether or not the renderer is ready. A load-dependent stroke would break determinism
> outright. The rule is graceful degradation — emerge at reduced LOD and fill in, never stall the
> sim. This is exactly the kind of thing a later well-meaning change gets wrong, so it belongs in a
> comment at the call site, not only here.

This is also a **reusable primitive** rather than a one-off, which matters for the long arc from
guns-only to the air littoral to the medical simulator. A hangar door, an airlock, a lift shaft and
an ambulance bay are the same object: a bounded, sealed, known-duration corridor that hides a world
build.

---

## 6. The theatre

**~393 km square over the Ukrainian steppe**, AOI 33.0–38.4° E, 46.6–50.2° N, 30 Copernicus GLO-30
cells, all fetched and sha256-locked (1.0 GB, 0 failures).

Chosen for terrain grammar, not politics: the lower Dnipro and the Dnipro bend in the west, the
Prydniprovska and Donets uplands in the east, the Samara and Siverskyi Donets between them. Rolling
steppe with real relief at both ends and two big rivers — matching the setting note's observation
that Ukraine is "largely flat-to-rolling steppe cut by big rivers… sightlines are long and masking
is scarce."

| | Korea central-front | Ukraine theatre |
|---|---|---|
| Span | 131 km | **393 km** (24 × 16,384 m) |
| Truth spacing | 128 m | 256 m |
| Truth grid (embedded) | 2.00 MB | **4.51 MB** |
| Visual tiles | 64 | **576** |
| Bundle (Range-streamed) | 10.75 MB | TBD |

**Fact/fiction line:** real terrain at real coordinates, honest georeferencing. Every installation,
unit and front line placed on it is invented. Same line the Korea pack already draws.

**Projection:** the builder hardcoded UTM zone 52N. Ukraine straddles zones 36 and 37, and forcing
one zone puts the far edge 5.4 degrees off the central meridian — ~0.16% scale error, about 640 m
across the cell. The central meridian is therefore parameterised from the region entry (35.70° E),
keeping identical transverse-Mercator maths. **Acceptance test: the Korea product must rebuild
bit-identically.** Synthetic valley carving is made opt-in for the same reason — Korea keeps its
fictional valley network, real Ukraine terrain is not carved.

### Why 393 km is the right size — the aircraft picks it

Cruise at the design point (M2.6, 21,500 m), mid-cruise mass ~6,500 kg:

| | |
|---|---|
| Dynamic pressure | 21.0 kPa |
| C_D0 with wave drag (3.01× above M1.15) | 0.0617 |
| C_L / induced | 0.169 / 0.0036 |
| Drag = thrust required | 24.7 kN |
| Fuel flow at ~55 mg/N·s ramjet TSFC | 1.36 kg/s |

Of 2,700 kg: ~900 kg to climb and accelerate through M1.6 where the ram lights, ~400 kg reserve and
trap, leaving ~1,400 kg of cruise — about 17 minutes, 790 km. **Radius of action ≈ 300–350 km.**

So the base sits ~300 km behind the front and the cell is exactly wide enough to hold both. That is
not a size chosen and then justified; it is what the fuel fraction buys.

> ⚠️ The 55 mg/N·s TSFC is a hand assumption, not a kernel number. The integrator is the authority
> and this must be confirmed against it before any of these figures are quoted as measured.

### Layout

- **Front** — across the northeast, along the Donets uplands.
- **Rapier launch complex** — west, on the Dnipro right bank. ~300 km back: at the aircraft's
  radius and outside the reach of the drones that crater forward fields. *That distance is why the
  aircraft exists.*
- **The contact** — an enabler orbiting behind the front, high and slow. Not a fighter.
- **The sortie** — 6.93 s in the tube, portal, climb on the turbine, ram lights at M1.6, cruise
  M2.6 at 21.5 km, dive, guns, recover on the hook.

With the tube, siting constraints collapse from five to essentially two: diggable ground, and a
clear approach for the trap. Flat steppe satisfies both trivially — the terrain that broke the
old design is ideal for the new one.

---

## 7. Open

- **Radius of action is unverified.** §6 is hand arithmetic; the integrator has not run it.
- **The trap is unverified.** The arrestor is rated 10.8 MJ against 12–15 MJ needed.
- **Bundle size at 576 tiles** is unknown; 9× Korea's tile count could be ~100 MB. Range-streamed,
  so only nearby chunks are fetched, but the repository still carries it.
- **The loading-corridor wiring does not exist yet.** The window is real and measured; nothing
  currently uses it.
- **Cost layer.** Earthworks (~50,000 m³) and the launcher belong in the flyaway/infrastructure
  ledger alongside the airframe and the fatigue-life accounting.
