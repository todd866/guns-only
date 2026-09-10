# Okanagan assistance and orientation

Build 360 candidate, following production Build 359 (`f0d47bd23642a13950b853ae640c1b374fa32677`).
The owner requested more automatic trim and better scenery and orientation.

## Pilot behavior

Automatic pitch trim is on by default. Releasing pitch selects the nose attitude;
the controller holds it by moving the existing elevator trim, with rate and range
limits. Stick input takes priority. The pilot can switch assistance off without a
trim step, or use the manual trim buttons/keys. The UI displays actual applied trim
and distinguishes active, inhibited and limited assistance. This does not hold
heading, bank, altitude, speed or power. See the [assistance policy and physical
response evidence](../airframes/at-802f-fireboss/01-assistance.md).

The director reads the mission's current active waypoint and shows turn direction,
true bearing, distance, target altitude MSL and the required climb/descent. Looking
at a different target does not change the mission route. The map opens by default
with an aircraft heading symbol, north arrow, scale, roads, lake shoreline and
named places from the existing geographic data. LOCAL follows the aircraft at a
fixed scale; ROUTE fits the remaining route. Existing traffic, drop aim and live
site-condition markers remain visible. NEXT reserves label space before place and
traffic labels. The map is read-only navigation.

## Scenery changes and limits

Runway paint was below the asphalt surface. It now sits visibly above it, with
runway numbers, aiming/touchdown markings and taxiway connectors. Terminal roof
detail follows the existing surrogate building footprint. Existing mapped lake
geometry gains a shoreline cue and subtle animated shading without changing water
height. Nearby conifers use deterministic bounded cells and avoid water, runway,
mapped settlements, resorts, agriculture and regional road corridors. Tree roots
use the rendered terrain triangle height; the physical contact sampler is unchanged.
Existing crowns no longer multiply a dark material by another dark instance tint.

The incident diagnostic camera was also 29.38 m below the hillside at its offset
position, producing a misleading view of apparently floating trees. It now clears
the terrain at the actual camera location. An independent raycast of 49 incident
tree roots against the rendered geographic terrain found a maximum grounding error
of 0.000326 m. The diagnostic-camera correction does not move the flight camera.

No generated imagery or new geographic claims are introduced. Regional ground
detail yields to measured imagery. The regional CDEM remains coarse and some
slopes remain angular; these changes do not upgrade the source elevation data.

## Verification scope

Focused native checks exercise fixed stick pulses, trim handover, power and water
mass changes, banked turns and slow-flight inhibition against the actual dynamics.
The original manual flight-response tests remain unchanged. Focused renderer
checks cover geographic bearings, route progression, map handedness, marker
clamping, runway paint height, tree grounding, stable bounded cells and disposal.

Browser acceptance uses the published WASM artifact and normal inputs with
`audioQa=silent`. A default-auto takeoff must not receive hidden manual trim or a
feedback pilot. Actual attitude, applied trim, speed, altitude and bank response
are separate evidence from whether the browser simply boots. Layout and scenery
captures cover desktop, portrait and compact landscape, plus the incident scene.
The first published-browser flight reached 107.3 m above actual terrain at 24.57 s
without manual trim. Release selected 9.911° pitch, held at 9.911° with 100.68 KTAS.
A later short pull selected 11.733° and settled at 11.771° after four seconds;
the bank input left 4.73° of bank while the heading changed and pitch stayed 11.730°.
Reducing power to 80.15% lowered speed to 93.03 KTAS while retaining 11.728° pitch.
Switching off transferred 12.715% trim to manual without a step; re-enabling selected
11.918° and settled at 11.916°. The flight ended alive at 374 m AGL.

Evidence is in `/tmp/okanagan-assist-nav-20260910/assist-publish1/summary.json`
and its full telemetry tape, with frozen source/WASM hashes. All 43 focused native
assistance, raw handling, tap and projection cases passed. The browser had no page
or console errors and destination audio gain was zero. Local Apple M5 sampling
recorded 3034 frames at 16.7 ms median / 17.6 ms p95, including boot; this is not
physical-phone performance evidence. The owner subsequently requested background
tests. Full Chromium headless was verified to retain ANGLE Metal Apple M5 WebGL2
without opening a visible window; subsequent browser checks use that mode.

The final background capture set contains nine desktop, portrait, compact
landscape and scenery views, with no page, console or shader-link errors. The
incident view is above terrain and the next-waypoint label is clear of the airport
label and map footer. A three-second running scene delivered 181 frames at 17 ms
p95 with an advancing mission clock. Evidence and frozen artifact hashes are in
`/tmp/okanagan-assist-nav-20260910/layout-freeze2-background/evidence.json`.
The preview is rendering evidence, not a flown incident approach. Browser and
server cleanup completed after each run.

A new owner flight and full OEM handling fidelity are not claimed by automated checks.
