# Winter Korea: the whole game moves to December

Date: 2026-07-23

## Origin

Owner direction, from a landscape-photography reference
([@northlandscapes](https://www.threads.com/@northlandscapes) — Jan Erik Waider, Nordic/Arctic
aerial abstracts): *"landscape photographers have some cool stuff that could be converted into
art assets… can we team fortressify some of this stuff somehow?"*, then *"yeah, lets make the
game winter, that's cool"*, then *"it's giving like, team fortress christmas edition. Makes it
even more horrifying lol."*

Constraints stated in the same conversation:

- *"I don't wanna simulate blowing people up, we're killing abstract entities. Makes the graphics
  cheaper, reduces the classification, and if we do it right it's still horrifying."*
- *"it's gotta have rock solid performance, no framerate tanking."*
- *"currently the game is way too slow at rendering terrain, so you can't do much worse."*
- *"I don't necessarily wanna go too hard on the christmas thing, but we can totally have it
  appear at times."*
- *"I don't mind if low flying is a bit dangerous… most of the low flying will be in drones."*
- *"Not entirely all snow, but it can be. Winter in Korea won't be entirely snowy anyways, but
  portions of it should be."*

## What the reference actually is

The recent feed is aerial abstraction: White Pocket (folded sandstone from above, "liquid
stone"), Sunken Trees at Rügen (overhead through clear water), Pollen in Motion (near-monochrome
black water and white marbling), an unnamed glacial river delta (white braided channel against
dark striated rock), Coastal Confluence in Iceland (sediment plume into black sand), and
Breiðamerkurjökull ice ("the endless shades of glacial blue").

The formal language repeats:

- **Overhead framing.** Almost every image looks down — which is a flight sim's default view.
- **Duotone.** One hue family plus white and black. Not "realistic colour"; a two-colour ramp.
- **Flow-line structure.** Braided channels, sediment plumes, marbling, strata: sinuous
  high-contrast linework over a low-contrast field.
- **No mid-frequency detail.** Big shapes and fine filigree, nothing between. Every image reads
  at thumbnail size, which is the same silhouette-first principle as `docs/art-direction.md`.

None of this is asset work. It is palette, value banding and atmospheric layering — the exact
vocabulary `korea_terrain.js` already speaks (banded elevation ramp at line 107, half-Lambert
tone steps at 124, rim at 129, exponential aerial haze at 140). It costs ALU, not memory.

The load-bearing coincidence: the braided-channel and sediment-plume images are pictures of
**drainage networks**, and `docs/low-level-playground.md` has the next terrain build carving
drainage-following valleys into the authoritative heightfield. That build computes the data these
photographs are of. Shading it as flow rather than as land cover gets the look nearly free.

## Doctrine changes

### 1. Abstract entities only — amends `docs/art-direction.md`

`docs/art-direction.md:28-33` currently directs that 1950s Korea be rendered "as realistically and
unsparingly as the platform can manage: burning villages, wrecked columns, the human ruin of that
war." **That clause is retired.** No human casualty rendering in either era. Ground targets are
machines and shapes: vehicle columns, revetments, AAA sites, bridges, structures.

This is already most of the way true in canon — `docs/drone-war-design.md` makes the 2030s
opposition attritable strike drones, and `docs/robot-airframe-design.md` makes the apex tier an
uncrewed UCAV. The amendment extends that to the 1950s ground war.

The two-era thesis survives the amendment, and sharpens:

> Nobody is ever rendered. In 1950 that is because you are four miles up doing 500 knots — the
> abstraction is imposed **by physics**. In 2030 it is because the interface decided you should
> not see — the abstraction is imposed **by design**. The two frames look identical. The reasons
> are opposite.

Gore would have weakened this by letting the player off the hook — *at least the 1950s one was
real*. Under the amendment the player cannot tell the eras apart by looking, which is the
argument. Three practical wins follow: no character art, no classification problem, less
fragment and geometry work.

### 2. Winter is a world property, not a mode

No season system, no runtime toggle, no season×era matrix. `SummerColumn` becomes `WinterColumn`,
the scenery profiles take winter values, the pack ships winter. If summer is ever wanted back it
is a second authored pack, not a switch. YAGNI.

### 3. Christmas is a reserved capacity, not doctrine

Build the mechanism; leave it off by default. Two places it earns its keep:

- **A December scenario.** The history is exact: the Battle of the Chosin Reservoir ran
  27 Nov – 13 Dec 1950, the Hungnam evacuation completed on Christmas Eve, 24 Dec 1950 with the
  waterfront being demolished behind the departing fleet, and MacArthur's November promise had
  been that the troops would be **home by Christmas**. December 1950 *is* the setting.
- **IFF tagging.** Green for friendly, red for hostile, in the 2030s crew station. A
  psychological-safety rendering doctrine would absolutely colour-code friend and foe cheerfully;
  this is the horror and the function in one mechanism, and it is justified year-round.

## Performance

This section is a gate, not an aspiration.

### The finding: early-Z is globally disabled

Verified by inspection of the vendored Three r160, not from memory:

- `web/wwwroot/app.js:3514` sets `logarithmicDepthBuffer: true`.
- `three.module.js:19990` defines `USE_LOGDEPTHBUF_EXT` when
  `logarithmicDepthBuffer && rendererExtensionFragDepth`.
- `three.module.js:20912` computes `rendererExtensionFragDepth: IS_WEBGL2 || extensions.has(
  'EXT_frag_depth' )` — **unconditionally true on WebGL2**.
- `three.module.js:13946` therefore compiles `logdepthbuf_fragment` to a `gl_FragDepthEXT` write,
  aliased to `gl_FragDepth` at line 20230.

Writing `gl_FragDepth` disables early-Z and hierarchical-Z on essentially every GPU. Every
fragment runs its full shader even when occluded. Flying a valley with stacked ridgelines is near
worst-case overdraw, and the full banded-palette + `sin()` + rim + fog shader is paid for every
hidden fragment.

Corroborating evidence, all from comments already in `korea_terrain.js`: the weak-tier LOD floor
at line 231 ("capping fill-rate and overdraw where it hurts most"), the `FrontSide` split at line
344 ("this is where the 'face-full of ground' fill cost lives"), and the tier gate at line 83
("the shader's most expensive fragment work"). Three separate fill-rate mitigations, with early-Z
off underneath all of them.

**Proven:** early-Z is disabled. **Not proven:** that it is the dominant cost. The diagnostic is
one line — set `app.js:3514` to `false` and read frame time at a fixed resolution scale.
Z-fighting will appear at distance; that is what the flag exists to prevent, so this is a
measurement, not a candidate fix.

If confirmed, the fix is **two-frustum rendering**: a far camera and a near camera with a depth
clear between them, which is the standard flight-sim answer and removes the need for logarithmic
depth entirely. A depth pre-pass does **not** help, because the colour pass would still write
`gl_FragDepth` and the depth test would still happen after the fragment shader.

### The gate

Adaptive resolution (`render/visual/adaptive_resolution.js`) runs an EMA frame-time controller
against `targetFps` with up/down thresholds and a scale range. **A perf regression here will not
appear as a dropped framerate — the controller will absorb it as a quietly softer image.**
Measuring FPS would therefore pass a change that made the game blurrier.

The gate pins resolution scale at 1.0 and measures milliseconds:

> **Winter must be no slower than summer.** Fixed scale 1.0, balanced tier, marquee-valley
> scenario, frame time ≤ the summer baseline captured before any shader edit lands.

Not "within 5%". Not slower. The claim being tested is that snow *removes* work: the parcel-tint
block at `korea_terrain.js:85-97` (four `sin()` plus two nested `sin()`) gates out above the snow
line, field-row instancing drops under snow, bare trees carry fewer vertices than foliage, and
overcast shortens effective draw distance. If the gate fails, the claim was wrong and the design
needs revisiting rather than the gate relaxing.

## Design

### Layer inventory

Four of the five layers are already authored data. Only terrain is hardcoded.

| Layer | Where it lives now | Winter change |
| --- | --- | --- |
| Sky, sun, cloud colour | `content/packs/korea-1950s/environment/atmosphere.material.json` | JSON values |
| Ocean colour + optics | `content/packs/korea-1950s/environment/ocean.material.json` | JSON values |
| Scenery density/colour per era | `KOREA_SCENERY_PROFILES` in `korea_scenery.js` | JS data values |
| Weather, wind, cloud physics, icing | `sim/Environment/KoreaWeatherPresets.cs` | new column + presets |
| Terrain palette | hardcoded GLSL, `korea_terrain.js:74-131` | shader rewrite → profile data |

The genuinely new assets are three: a frozen-water material, a bare-tree LOD, and an emissive
window treatment.

### Atmosphere (kernel, honest)

Every current preset in `KoreaWeatherPresets.cs` shares one sounding, `SummerColumn` (line 11),
anchored at 288.2 K and 101 180 Pa. Winter Korea sits under the Siberian High: surface near 263 K
and near 1030 hPa. Combined that is roughly **11% denser air at the deck** —
ρ ∝ p/T gives (103000/101180)·(288.2/263) ≈ 1.115.

Consequences, all already modelled: more thrust, more lift, better sustained turn, better climb,
lower TAS for a given IAS. Plus north-westerly monsoon flow through the existing `Wind()` helper,
real icing in winter stratus through the existing `icingHazard01` field, and the exceptionally
clear continental air that makes the duotone legible at range.

This re-baselines `FlightModelTests`, `AirDataTests`, `AtmosphereTests`, the AutoGCAS corridor
tests and carrier recovery, as a deliberate labelled change.

### Terrain shading

Three terms, all from inputs the shader already carries:

- **Snow mask** = f(elevation, aspect, 1−steepness, world position). "Region" is derived from
  `vTerrainWorldPosition` — already a varying — as a low-frequency east/west gradient plus a
  large-wavelength noise term, so no new attribute or texture is needed. Snow is **patchy, not a
  sheet**: the
  Siberian High makes Korean winter cold and dry, so the inland west is largely brown, frozen and
  bare, while snow concentrates on the Taebaek spine, the east coast under sea-effect snow off the
  East Sea, and the north. This is both more honest and closer to the reference, which is duotone
  with white *accents* rather than white fields. Where the mask is high, the parcel-tint block is
  skipped.
- **Wind scour** = `dot(normal.xz, windDirection)`. One dot product; snow accumulates on lee
  slopes and is stripped from windward faces, producing the directional streaking that runs
  through the reference.
- **Duotone ramp** replacing the current four-colour mix — two hues plus white, which is *fewer*
  operations than what is there now. The hues move out of GLSL into the visual profile as data,
  matching how ocean and atmosphere are already authored.
- **Frozen watercourses.** Valley floors take an ice treatment with braided-channel structure,
  riding on the drainage carve from `docs/low-level-playground.md`. This is the most
  reference-specific element and the one that depends on that build landing first.

### Sky, ocean, scenery

Sky and ocean are JSON edits: a low winter sun with long shadows and cold colour temperature,
high-coverage low stratus, blue cloud shadows, a dark slate Sea of Japan with white-grey foam and
no warm glint. Frozen reservoirs and sea ice are a *cheaper* material than the animated ocean —
no scrolling normals.

Scenery takes winter values in both era profiles: snow-capped roofs, bare trees, snow-covered
fields where field-row instancing can drop entirely. The 2030s profile gains the emissive window
capability (one additive emissive per building) and the accent-colour slot, both **off by
default** per the reserved-capacity decision.

### Readability

Deliberately *not* guaranteed. Owner direction is that whiteout and flat light may bite, and that
most low-level work is drone-flown. Obstacles keep their existing bold-silhouette and marker
treatment; no additional contrast floor is authored.

## Hard boundaries

- **The HUD stays an instrument.** The 600+ assertion contract does not move. No festive HUD
  chrome, no seasonal symbology.
- **Determinism holds.** Seeded carve and scenery, bit-identical; goldens re-baselined as a
  labelled terrain/atmosphere version change.
- **The content-pack boundary holds.** The look ships as profile data and presentation-layer
  shaders.

## Order

1. **Measure.** Capture the summer frame-time baseline at fixed scale 1.0, then run the
   `logarithmicDepthBuffer: false` diagnostic and record the delta.
2. **Terrain depth architecture**, if the diagnostic confirms — two-frustum rendering, with the
   baseline re-captured afterwards.
3. **`WinterColumn` + monsoon winds + winter presets**, with the golden re-baseline.
4. **Terrain palette out of GLSL into the visual profile**, then the winter duotone, snow mask and
   wind scour.
5. **Sky, ocean, scenery winter data**; frozen water material.
6. **Reserved-capacity mechanisms** — accent slot, emissive windows — built and left off.
7. **Doc amendment** to `docs/art-direction.md` retiring the gore clause and recording the
   re-founded two-era thesis.

Frozen watercourses (design §Terrain shading) land with the drainage carve, not before.

## Verification

Structural green does not prove pixels (Builds 60/62). Every visual step ships only after rendered
screenshots are read from the HUD scenario harness, at minimum: cruise altitude for the aerial
abstract read, valley floor for low-level obstacle legibility, and both eras. The performance gate
runs before and after every step that touches a shader or a scenery profile.

## References

- Mitchell, Francke, Eng — "Illustrative Rendering in Team Fortress 2", NPAR 2007.
- [Hungnam evacuation](https://en.wikipedia.org/wiki/Hungnam_evacuation) —
  [Naval History and Heritage Command](https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/h/the-hungnam-and-chinnampo-evacuations.html),
  [ARSOF History](https://arsof-history.org/articles/v7n1_hungnam_page_1.html).
- `docs/art-direction.md`, `docs/low-level-playground.md`, `docs/drone-war-design.md`,
  `docs/robot-airframe-design.md`, `docs/complexity-ladder.md`.
