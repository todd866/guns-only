# Okanagan flight validation and Baldy coverage — Build 355

Build 354 was committed as `baffca90` after its complete gate passed. Continued flight testing found route problems that the earlier coordinator tests could not reveal. This record belongs to the subsequent candidate; production remains Build 352.

## What the physical flights exposed

A deterministic pilot sends ordinary `FireBossPilotCommand` values to `OkanaganFireMission.Step` at 10 Hz, while the shared aircraft model runs every 1/120-second tick. It starts on the Kelowna runway and scoops actual water mass. It neither injects telemetry nor changes phases, position or aircraft performance constants. This is simulation regression evidence, separate from a browser input journey or a human acceptance flight.

The original descent began before clearing the airport-side hills. Departure now requires climb clearance and the lake join keeps its altitude until an over-water descent. The scoop lane moved south into wider water. A loaded takeoff no longer advances its first gate while still on the water or below 500 m MSL.

The mountain climb now accounts for the high lead-in to the downhill attack, with room to align before descending. The test pilot protects airspeed instead of pulling through the stall while demanding climb. Real terrain, water mass, fuel consumption and aircraft dynamics remain authoritative.

A Big White probe reached the sector and delivered an effective load, then revealed a return-route error: a point labelled over lake was inland, and a vertical stack demanded a long descending orbit. The return now clears the remaining terrain and descends gradually toward a mapped lake point before crossing to Kelowna. The old final approach also began too close and too high; the runway-aligned initial and final now leave room to descend and settle on the centreline.

The earliest failed tapes remain in `/tmp/guns-okanagan-flight-probe*.log`; a failed or timed-out tape is never counted as successful coverage. Full final results are pending below.

## Baldy building coverage

The regional public basemap services exposed contours, parcels and address points, but no usable building-footprint layer for this extent. NRCan’s optimized footprint dataset returned one poor-quality ridge feature; it was not imported.

The [Microsoft Canadian Building Footprints](https://github.com/microsoft/CanadianBuildingFootprints) archive supplies 62 automatically extracted footprints inside the Baldy tile. The authoring pipeline retains the existing OSM building and adds these without overlapping mapped roofs, giving 63 footprints. The archive is pinned by SHA-256; each added geometry retains its own hash, source and extraction label. Microsoft’s ODbL attribution is visible in the game and the downloadable derived database.

The extraction has no building-use tags, measured heights or precise per-footprint imagery dates. Use remains unknown; heights are 6 m surrogates. This improves the village layout without claiming a complete present-day housing inventory. Baldy remains scenery only, pending further coverage and mission validation.

Seven silent renderer captures passed with no page errors, including the revised Baldy village view. Three Python GIS integrity checks and the four resort JavaScript tests passed. Captures are in `/tmp/guns-355-scenery-qa/`. Geometry counts are not hardware frame-rate measurements. The Mac was locked, so native interactive inspection was unavailable; headless captures were inspected directly.

## Independent review and final checks

A scoped read-only Cursor review was attempted for the route/controller changes and source authoring. It returned “Authentication required” before reviewing; no independent approval or findings are attributed to that attempt.

## Flown defence drops (7 September 2026)

The first complete run of the five physical flights left Apex and Peachland failing the one assertion that matters: the flown drop did not improve aggregate site integrity against an untreated control. The water was released and credited against the fire, so the failure was not a dead release. Recording every 0.1 s command tick that released water showed why: the whole 2,465 kg load leaves in 1.6 s over about 90 m of track, and the test pilot opened the doors 175 m before the aim, so the water landed 80–175 m short of the aim point every time. The aim point itself was the fire's geometric centre, offset 200 m east and 160 m north of ignition. Protection wets sites within 185 m of the release track. At Peachland the nearest mapped building to the aim was 99 m away but 167 m or more from where the water actually fell; at Apex the nearest building to the aim was 307 m away. Big White and SilverStar passed only because their villages happen to sit on that offset.

The corrected authority aims the defence run at the buildings. Among the 24 mapped sites nearest ignition, it picks the site whose 100 m water footprint along the downhill run reaches the most buildings, weighted by the same 185 m falloff the wetting model applies; the run direction still comes from the fire's slope. A first attempt scored candidates over the full 650 m drop window and sampled the slope at the aim instead of the fire, which swung SilverStar's run 86 degrees onto different relief and let the village burn while the aircraft manoeuvred: a reminder to move one variable at a time. A second attempt let the test pilot descend at 16 m/s on the drop run to get under the delivery ceiling; it took Big White to 8 m of terrain clearance and flew Apex into the hill after release, and was reverted. The test pilot now opens the doors 110 m short of the aim so the salvo straddles it.

Moving the aim exposed a route defect at Big White: the straight descent from the ridge entry to the drop line crossed a secondary summit, the lifted terrain gates demanded a climb the loaded aircraft cannot fly, and it crossed the ridge with 23 m to spare. The cruise altitude now also clears the relief under the approach itself, and the approach profile is monotonic: a gate lifted over relief lifts every gate before it, so the pilot holds altitude until the relief is behind. All five flights then pass.

| Sortie | Buildings the load reached | Integrity gain vs untreated control | Minimum transit clearance |
| --- | --- | --- | --- |
| Peachland | 39 | +10.6 | 152 m |
| Big White | 20 | +5.9 | 138 m |
| SilverStar | 32 | +9.9 | 111 m |
| Apex | 21 | +5.8 | 66 m |

Two consequences for the player follow from aiming at buildings rather than fire. First, a defence load can cool fewer than the 420 kg of fire credit the effective-drop counter demanded, so the debrief would have said "No effective drops" after a drop that wetted 21 homes; a defence drop that reaches at least three standing sites now counts. Second, wetness decays within minutes, so by landing the debrief could not tell which sites the water reached; each site now carries an authority record that a release made it materially wet, the debrief reports "reached by your drop · N of M", the HUD condition line shows the count, and the ground markers turn blue. The physical flight test requires the drop to be counted and at least ten sites reached. This is the authority's record of what the load touched; it is not a claim about houses saved.

The Water Circuits route-length pin was moved from 40–55 km to 45–60 km to match the authored 55.6 km circuit, whose lake join runs 5 km south of the scoop entry so the descent stays over water. The bound still refuses the former 28 km dead recovery dogleg.

The mountain sorties remain long: the lake-to-resort cruise alone is 46–70 km each way at about 56 m/s, so Apex is a 75-minute sortie. That is the mapped geography, not a route defect.
