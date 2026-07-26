# The buried launch tube, and siting the Rapier in Ukraine

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
basing is deep. A buried launcher cannot be cratered, and you can dig another one anywhere.

### The kernel decides the shape, and it decides against the elegant version

The obvious design is a flat run with a curved pull-up at the end, because a straight 7 degree
incline puts the breech 63 m underground while a curve needs almost nothing:

| | |
|---|---|
| Pull-up radius at 150 m/s, 3 G | 765 m |
| Arc to reach 7 degrees | 93 m |
| Depth below grade | **5.7 m** |

Eleven times less excavation. It is the right engineering answer and it is **wrong for this
simulator**, because `CatapultLaunchModel.StrokeState` (`sim/Carrier.cs:710`) holds the aircraft at
constant deck height, pitch 0.8 degrees, with no vertical motion, for the *entire* stroke. Only at
stroke end does it go airborne at `AirborneHeightM = 4.0` with velocity split along the ramp angle.

There is no curve in the physics. Drawing one would put the aircraft visibly above or below its own
rail. **The rail must be dead flat**, and the 7 degrees exists only as the departure path after the
portal. The renderer test now pins this: every rail vertex shares a y, and no rail node carries an
x-rotation, so a future inclined ramp fails loudly rather than quietly floating the aircraft.

This is the general rule the episode illustrates: *the presentation is not free to be more correct
than the kernel.* If the curve is worth having, it belongs in `CatapultLaunchModel` first.

### Final geometry

All of it derived from kernel constants rather than invented:

| | |
|---|---|
| Rail | flat, y = 0, cross −7 m, 560 m |
| Stroke | 520 m from +20 m along |
| Acceleration | 21.63 m/s² = **2.21 G** |
| Duration | **6.93 s** |
| Natural grade | +12 m above the rail |
| Tube bore | 14 × 8 m internal |
| Aircraft span (AR 3.0, S 18 m²) | 7.35 m |
| Earth cover over roof | ~3 m |
| Portal | 560 m, roofed for the full length |
| Open cutting beyond | 150 m (7° clears the 12 m grade at 98 m) |

Excavation is roughly 520 × 12 × 8 m ≈ 50,000 m³. In Ukrainian chernozem and loess — some of the
easiest digging anywhere — that is well under a million dollars of earthworks against a
multi-million-dollar airframe. It costs into the cost layer properly.

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
