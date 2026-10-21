# Nellis AFB from OpenStreetMap: layout for the Area 51½ open world

Fetched 2026-10-21 from Overpass (OSM base timestamp 2026-10-21T12:42Z). METERED_LINK absent. One 8.3 MB query after a 502 "at capacity" retry; the public endpoint needs a real User-Agent (plain curl gets 406).
Files in `~/.local/state/area51-nellis/`: `osm-raw.json` (13,868 elements, geometry inline), `nellis.geojson` (3,173 features, lon/lat, with `origin` and `projection` members). `q.ql` is the query. The build script is throwaway.

## Region and frame
- Airfield: way 162570573 (aeroway=aerodrome, ICAO KLSV; 7.1 km², perimeter 14.6 km).
- Base: relation 16282210 has two outers. The main one (way 758208019) is Areas I/II and runs 58 km² east to the weapons storage area (about -114.92). Only the part inside the fetch window (lat 36.205-36.262, lon -115.0732 to -115.008) was pulled. The second outer is Area III (way 1377332778; 4.8 km², perimeter 11.6 km), the base-housing area NW of the flight line.
- Features kept: centroid inside the airfield, main or Area III polygon. The 5,837 `power=generator` solar-panel nodes are counted but excluded from the GeoJSON.
- Frame: origin lat 36.241303, lon -115.044658 (bbox centre of airfield + Area III). `x = rad(lon-lon0)*R*cos(lat0)`, `y = rad(lat-lat0)*R`, R = 6371008.8 m, +x east, +y north. Error is under 0.1 % over 6 km.
- Playable window: x -2558..3219, y -4036..2291, about 5.8 x 6.3 km. The airfield alone is about 3.8 x 3.9 km.
- Perimeter: the fence/wall ways inside the window total 51.7 km, but they are partial. The tagged boundaries are 14.6 km (airfield), 11.6 km (Area III) and 44.3 km (the whole main outer). A game perimeter should be the airfield + Area III outline, about 26 km, not the fence ways.

## Counts (inside region)
| Item | Value |
|---|---|
| Buildings | 1,176 footprints, 797,000 m² (0.80 km²). 10 named, 3 with levels, 0 with height. 8 `hangar` + 24 `roof` |
| Roads | 198 km total. Service 92.4, unclassified 51.9, residential 21.5, footway 20.7, path 7.1, track 4.4 |
| Runways | 2, parallel, both heading 041° true (03/21): 03R/21L 3,081 m x 46 m; 03L/21R 3,076 m x 61 m (concrete). Centrelines about 307 m apart |
| Taxiways | 70 ways, 20.4 km. No `holding_position` nodes |
| Aprons | 14 polygons, 1.16 km². Main flight-line ramp 656,000 m² (no name tag) at (+618, -71). Other aprons are named: DOE ramp 206,000 m², Revetments 72,000, Live Ordnance Loading Area 54,000, Bomber Pad 29,000, Primary Hazardous Cargo Area 7,400 |
| Hangars | 9 tagged, 17,100 m² (a row of 6 near (+380,-400), 2 near (-380,-1200), 1 near (+520,-130)). Other large sheds are plain `building=yes` |
| Helipads | 16 (Jolly Pad, Transient Pad, a 2x3 cluster at the north end near (+1560,+1000)) |
| Barriers | 40 gates, 40 fences, 18 walls, 1 lift gate; 3 `military=checkpoint` gates |
| Land use | Golf (Sunrise Vista) 0.87 km², residential 1.49 km², parks 0.09 km², 11 pitches, 29 playgrounds, 2 running tracks, industrial 0.15 km² |
| POIs (sparse) | BX (node), Starbucks, Burger King, 7-Eleven, hospital (Mike O'Callaghan MMC), post office, CCSN college, 4 schools, 1 church, fire stations x2, McClintock Pool, Warrior Fitness Gym, Sunrise Vista clubhouse |

Gaps. There is **no commissary, chapel (beyond the Baptist church off-base), Thunderbirds or Red Flag feature** in OSM. "Thunderbolt Avenue" is the only hit for "Thunder". Place those by hand on the main apron and near the BX. Heights are absent, so derive them from building type and area. Footprints look like Microsoft imports, and the 1,141 `building=yes` entries are not classified.

## Spatial relations (metres, local frame)
- **BX** (Base Exchange node, with Starbucks and Express Class 6 beside it) at (-546, -791), 814 m from the nearest runway edge. The runway lies to the SE (bearing 131°) as the crow flies.
- **Base housing** (Area III centroid) at (-1285, +1132), 2.64 km from the nearest runway, bearing to it 131°. It is NW of the flight line, beyond the hospital (-412, +507; 1.57 km from the runway). Housing to BX is 2.06 km at bearing 159°.
- Golf course at (-330, -2776), about 1.0 km south of the runway threshold. Lomie Heard Elementary at (-1228, -718); Warrior gym at (-1201, -1224). Main gate (checkpoint) at (-607, +29); other checkpoints at (+93, +474) and (-1488, -1749).
- Runway threshold 03 ends near (+24, -1842) and (-192, -1622); the 21 ends near (+2051, +479) and (+1834, +693).

## Tiling plan (256 m)
- Grid extents ix -10..21, iy -16..9. **302 non-empty tiles** (958 at 128 m, 161 at 512 m).
- Triangles from extruded simple footprints (walls 2/edge, flat roof n-2, plus road/taxiway ribbon quads and apron quads): **median 28, p95 664, max 1,094 per tile; 41,900 total**. With pitched roofs (about +2 per 4-gon, +n otherwise): p95 832, max 1,404; 50,000 total. This is trivially within budget, so the whole base could stay loaded. Max is 45 buildings in a tile (housing). The cost is in draw calls and in instanced aircraft, not in buildings.
- **Flight-line ramps (tiles with at least 2,000 m² of apron): 54 tiles, 62 touched, 1.165 km²**, spanning ix -4..9, iy -9..4. Main ramp tiles (largest first): (7,-2) 61 k m², (0,-4), (-1,-5), (1,-3), (-2,-6), (4,1), (2,-2), (4,4), (7,-1), (-2,-7), (3,-1), (4,2). The DOE ramp is the (7,-2)/(7,-1) block, the revetment row sits around (2,-8), and small north aprons around (4,4) and (5,2).
- Red Flag parking: at about 700 m² per fighter slot with a taxi lane, 1.16 km² holds roughly 1,600 slots on paper and about 800 at a realistic 50 % usable. Hundreds of aircraft fit without inventing space. Park them as instanced meshes placed on a grid inside the apron polygons.

## Licensing
OSM is ODbL. Required credit: **"© OpenStreetMap contributors"** (link to openstreetmap.org/copyright), shown in a credits screen or the page footer. We derive our own geometry (extruded footprints, road ribbons) from the data and ship that as a Produced Work or a derived database. If we redistribute the derived tile database, it must stay ODbL with the same attribution and be open. The game binary and art are ours. Overpass terms: one or two polite queries are fine, and the production pipeline should use a local extract, not the public endpoint.
