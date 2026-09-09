# Build 354: Peachland, ski mountains and asset defence

The candidate replaces invented Peachland geography with mapped town geometry and adds actual ski
mountain layouts. It builds on the locally committed Build 353 practice, history and audit work.
Neither candidate has been pushed or deployed; production remains Build 352.

The old scenery had three material geography defects. The regional terrain stopped short of the
Peachland hillside, a simplified Highway 97 chord crossed the lake, and the lake polygon erased
Rattlesnake Island. There were also floating procedural houses, a bridge lift applied outside the
Bennett Bridge area, coarse triangles intruding into bays, and forest-to-rock colours starting far
below the ski mountains' tree line. These are corrected.

Peachland now uses 4,889 mapped building footprints with valid source heights, 347 road features,
18 park features in the database, RDCO bare-earth LiDAR sampled at approximately 30 m, and dated
georeferenced aerial land cover. Beach Avenue, Princeton Avenue and Highway 97 were checked along
segments, not just at vertices: the mapped centrelines have zero water intersections in the town.
The lake mesh and terrain cutouts preserve the measured shore and island holes. Roof forms,
materials, road widths and individual vegetation positions remain approximations. Park facilities
are not individually reconstructed. The detailed source/licence record is in
[the scenery sources](../../content/packs/okanagan-fire/environment/SOURCES.md).

The elevation hierarchy covers about 156 km north to south. It retains the central valley and
Peachland patches and adds roughly 58 m CDEM patches for Big White, SilverStar, Apex and Baldy.
Both C# collision and JavaScript rendering recurse through this same hierarchy and blend at parent
cell boundaries. This is measured source data at a chosen sample spacing, not a claim of centimetre
accuracy. A Big White high-resolution DEM probe returned NoData and was rejected.

Big White has 423 mapped building footprints, SilverStar 370 and Apex 267. Roads, summer run
clearings, lift alignments and end terminals come from the OSM-derived database; it remains a
separate ODbL product with visible credit and a download link. Lift way counts are not official
operating-lift counts. Intermediate tower placement, building heights without tags and run widths
are explicit surrogates. SilverStar's coloured facades are an artistic cue, not measured paint.
Baldy's mapped building coverage is inadequate (one footprint), so its mountain, runs and lift
scenery is included with the limitation recorded, without inventing a village or a defence sortie.

Four new exercises defend Peachland, Big White, SilverStar and Apex. Their C# authority tracks a
finite sector of mapped buildings and nearby lift terminals. Fire exposure reduces integrity;
water suppresses nearby fire and wets sites; lost sites remain lost. Ski-run grass can burn and
lake cells are non-burnable. Releases above 120 m AGL lose ground effect progressively, reaching
zero at 450 m: this is a game rule, not an operational drop table. The debrief reports intact,
damaged and lost sites at ground-crew handoff. It does not invent houses saved or residents rescued.
Only exposed sites contribute to the protection score.

These are one-load attack assignments departing Kelowna. Ignition begins on arrival within 7 km,
and site simulation runs until the aircraft leaves the sector by 4 km during RTB. The handoff
records condition at that point; it does not predict the eventual fire outcome. Ferry distance,
loaded climb, remote return and escape climb are included in the exercise fuel ladder. Final
reserve constants and aircraft physical capability are unchanged. The high mountain legs require
climbing over the lake and descending along terrain-aware gates. Runway contact and a stop are
still required to finish.

## Review findings and verification

The independent Cursor review correctly identified two coordinator defects introduced during
implementation: resetting ingress gates on the drop transition, and an escape-climb gate that
could strand progression behind the aircraft. Drop now preserves gate progress; the climb gate
accepts the required altitude without requiring a return to exact drop coordinates. Coordinator
lifecycle tests exercise departure, scoop, ingress, drop, handoff and stopped runway recovery for
all four new assignments. These tests inject telemetry into the mission coordinator; they do not
claim to have flown the full approaches through aircraft dynamics.

A terrain test caught a straight descent intersecting a secondary summit at Apex. Intermediate
approach gates now sample the relief, and segment clearance is tested. Fuel planning now includes
remote transit and climb allowances. The review's score-denominator concern was accepted: scoring
normalizes over threatened assets, with zero credit if no site was exposed.

The review also claimed that a shared Three.js program cache key would skip other materials'
`onBeforeCompile` and share their uniforms. Inspection of the bundled renderer showed a separate
per-material program map and uniform assignment; the callback runs for a newly used material.
Also, only Peachland currently uses the aerial material. No speculative shader-key change was made.

The performance concern was checked with actual scene counts and browser captures. Runway paint
was merged from 41 strips into one draw. Footprints, roads, runs and trees remain batched. Resort
scenery outside 25 km is hidden while measured terrain stays present; trees fade at patch edges.
Mobile uses fewer trees and smaller aerial textures. The complete mobile scene is bounded below
1.8 million triangles and 80 meshes; the captured Peachland phone view draws about 754,000 triangles
in 12 calls. These are geometry/capture measurements, not hardware frame-rate promises.

The focused record before the full gate: 73 C# Okanagan tests, 57 JavaScript Okanagan tests and three
Python GIS integrity checks passed. Protection tests compare a finite 3,100 kg pass with an
untreated control in each sector, and assert improved site integrity. Tests also cover irreversible
loss, zero unexposed credit, release-height attenuation, nested samplers, grid seams, island water
classification, map-source closure and imagery hashes. Source authoring checks reject missing
raster values and enforce pixel/extent alignment.

The initial full gate stopped at the release-history guard because the runtime had changed after
Build 353 was committed. The atomic release stamp advanced the candidate to Build 354. The following published-browser run caught a phone-width defect: `96vw` plus the overlay padding exceeded the viewport. The brief and result cards now fit their containing block. That review also moved sector condition out of the accessibility-only mirror, populated working fuel from authority, and retained site condition in the local logbook. The focused seven-sortie published-browser journey then passed, including the phone width assertion. The final serialized full gate passed on 6 September 2026: 2,449 Node source/unit tests, 88 Python checks, 2,484 C# simulation tests, 10 presence-server tests, four arena-server tests, 18 published-browser journeys and 2,265 HUD assertions. The Release solution built with zero warnings or errors. Existing optional skips were one Node and ten C# tests. The complete local log is `/tmp/guns-354-complete-gate.log`. The gate cleaned its temporary publish; later manual flight checks must rebuild from this tested source, rather than reusing an older diagnostic publish.

Silent visual captures are retained at `/tmp/guns-okanagan-qa/` (Peachland waterfront and hillside,
Big White, SilverStar, Apex, Baldy and a 390 × 844 Peachland view). The preview uses the actual
renderer and content without an audio graph. Captures were inspected for coastline, mapped village
forms, lift/runs alignment, cover, holes and obvious floating geometry. Full human flights and an
owner accuracy review remain distinct acceptance evidence; neither is inferred from unit tests.
