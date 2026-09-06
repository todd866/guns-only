# Okanagan scenery and incident sources

This is a summer flying environment with fictional wildfire exercises. Geometry is source-backed;
rendering detail and fire behaviour remain game approximations. Retrieval: 5 September 2026.

## Terrain and water

- **Valley:** Natural Resources Canada [Canadian Digital Elevation Model](https://download-telecharger.services.geo.ca/pub/nrcan_rncan/elevation/cdem_mnec/doc/CDEM_en.pdf),
  [082E](https://ftp.maps.canada.ca/pub/nrcan_rncan/elevation/cdem_mnec/082/cdem_dem_082E_tif.zip)
  and [082L](https://ftp.maps.canada.ca/pub/nrcan_rncan/elevation/cdem_mnec/082/cdem_dem_082L_tif.zip).
  Archive SHA-256 hashes are in the terrain JSON. The source GeoTIFFs use NAD83(CSRS), EPSG:4617;
  WGS84 sample coordinates are transformed before bilinear sampling at pixel centres.
  The regional mesh is 449 × 257, approximately 350 m spacing. The central valley retains a
  257 × 257 CDEM detail region, approximately 175 m spacing. Ski terrain patches sample the
  CDEM at approximately 58 m spacing. Sampling density is not survey accuracy.
- **Peachland:** [RDCO 2018–2019 LiDAR bare-earth elevations](https://www.rdcogis.com/arcgis/rest/services/ElevationSources/RDCO_Elevations_LiDAR2018/ImageServer),
  OBWB / GeoBC, CGVD2013. The 385 × 433 mesh has approximately 30 m sample spacing. Its bounds
  align to parent grid cells; detail heights blend over one parent cell at each boundary.
  Render and simulation recursively sample the same committed hierarchy.
- **Lake:** [RDCO mapped Okanagan Lake](https://www.rdcogis.com/arcgis/rest/services/Basemaps/RDCO_Basemap/MapServer/41).
  Shoreline simplified at 0.00004 degrees with topology preserved. Island holes include
  Rattlesnake Island opposite Peachland. Terrain cells are clipped against the same water polygon;
  a coarse sloping land triangle cannot fill a mapped bay. Lake elevation remains 342 m.
- The LiDAR and CDEM vertical references differ; the smooth boundary blend avoids a hard seam.
  This is not a geodetic datum conversion. The rejected NRCan HRDEM probe at Big White contained
  only NoData. No synthetic flat mountain patch was substituted.

## Peachland

- [4,889 mapped building footprints](https://www.rdcogis.com/arcgis/rest/services/DataDownload/PCH_DataDownload/MapServer/6).
  Valid building heights are retained; two invalid or missing heights use explicit surrogates.
  Roof forms and wall materials are approximate. Footprints do not establish current occupancy.
- [347 road features](https://www.rdcogis.com/arcgis/rest/services/DataDownload/PCH_DataDownload/MapServer/2),
  including Beach Avenue, Princeton Avenue and Highway 97. Widths are visual surrogates.
- [18 park features](https://www.rdcogis.com/arcgis/rest/services/DataDownload/PCH_DataDownload/MapServer/18),
  including Swim Bay and Heritage Park, are retained in the map database. Their detailed facilities
  are not individually modelled.
- [Regional Highway 97 centreline](https://www.rdcogis.com/arcgis/rest/services/GIS_App/GIS_App_BASE/MapServer/20).
  The mapped geometry replaces the old straight chord through the lake. Bridge elevation is
  restricted to the Bennett Bridge area, not every road segment touching water.
- [2024 orthophoto](https://www.rdcogis.com/arcgis/rest/services/Orthos/Orthos_2024/ImageServer),
  approximately 3 m per exported pixel. Its backcountry gaps blend to complete
  [2018 orthophoto coverage](https://www.rdcogis.com/arcgis/rest/services/Orthos/Orthos_2018/ImageServer).
  These dated photographs are land-cover textures, not live imagery. Textures are relit by the game;
  trees and buildings in the photography are not all separate 3D objects.

Contains information licensed under the [Open Government License – Regional District of Central Okanagan](https://gis-rdco.hub.arcgis.com/pages/open-data-license).
No endorsement by RDCO, NRCan or the resort operators is implied.

## Ski mountains

The separate `okanagan-resorts.osm.json` database is derived from **© OpenStreetMap contributors**,
under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
See [OSM attribution and copyright](https://www.openstreetmap.org/copyright).
The same derived database is provided with the game for download. It is not relicensed as RDCO data.
Each resort records its extract timestamp, response hash and operator map reference.

| Resort | Building footprints | Mapped lift ways | Principal reference |
| --- | ---: | ---: | --- |
| Big White | 423 | 16 | [Operator alpine map](https://www.bigwhite.com/sites/default/files/inline-files/BWSR-Alpine-Trail-Map-2025-WEB.pdf), [village map](https://www.bigwhite.com/sites/default/files/inline-files/BW-25-RS-452-Village-Map-Full-Web.pdf) |
| SilverStar | 370 | 11 | [Operator mountain maps](https://www.skisilverstar.com/the-mountain/mountain-maps/) |
| Apex | 267 | 4 | [Operator trail map](https://apexresort.com/wp-content/uploads/2023/11/Trail-Map.pdf) |
| Baldy | 1 | 4 | [Operator site](https://baldyresort.com/) |

Counts are mapped ways, not a claim about the number of operating lifts or official named trails.
Building footprints, roads, run alignments and lift paths come from the mapped data. Heights without
source tags, roof forms, building colours, centreline run widths and intermediate lift tower spacing
are surrogates. Tower positions are not a pylon survey. Mapped buildings and lift termini are not
invented from resort marketing statistics. OSM way extracts omit relation-only features and can be
incomplete. Baldy's village is especially incomplete: its terrain, runs and lifts are scenery, but
it has no defence mission until adequate building coverage is available.

Summer grass remains on cleared ski runs. The surrounding subalpine stands are procedural,
not tree-by-tree mapped. The tree line transition and stand density are artistic/ecological
approximations; current logging, beetle damage and burn scars are not comprehensively represented.
The 2018 RDCO image service was tested at Big White and rejected because it did not cover the resort.

## Other valley scenery

- Low-elevation forest composition follows [BC ponderosa-pine ecology](https://www.env.gov.bc.ca/thompson/esd/hab/ponderosa_pine.html):
  open pine on dry lower benches and more Douglas-fir in cooler sites. No VRI polygons were imported;
  the former source note implying a mapped VRI forest was incorrect.
- Ellison, Rutland, East Kelowna and West Bench agriculture masks are authored surrogates,
  not cadastral parcels or current crop boundaries. Other communities retain procedural buildings.
- Kelowna's runway dimensions/elevation use published YLW figures. The terminal, taxiway and apron
  remain visual surrogates, not a current aerodrome chart. Aircraft physics was not retuned here.
- Census population values remain 2021 regional reference data. The new defence exercises report
  mapped site condition, not an inferred number of residents saved or evacuated.

## Fictional defence model

Peachland, Big White, SilverStar and Apex each have a finite sector of up to 64 mapped non-outbuilding
footprints plus nearby mapped lift terminals. Building category follows source tags; a building is
not assumed to be a house when the tag does not establish that. The initial fire, northeasterly spread
bias, moisture, fuel classes, structural vulnerability, wetting and ground-crew handoff are fictional
exercise inputs. The C7/O1/M1/C3 vocabulary does not turn this into the operational FBP model.

Ignition begins on first arrival within 7 km, so a long ferry does not consume the exercise before
player arrival. Water suppresses local fire and wets nearby sites. Grass clearings can burn; water
cannot. Releases above 120 m AGL progressively lose ground effect, reaching zero at 450 m AGL.
This bounded game rule is not a calibrated aerial drop table.

One attack load is assigned before return to Kelowna. Site condition continues to evolve until the
aircraft leaves the sector by 4 km during RTB; it is then recorded at ground-crew handoff. The game
reports intact, damaged and lost sites at that handoff, not a predicted final wildfire outcome.
Losses cannot be reversed. Protection score reflects integrity among sites actually exposed to fire;
unexposed sites earn no protection score. Aircraft recovery still requires runway contact and a stop.
Fuel planning includes the measured ferry distance, a loaded climb allowance, the remote return and
an escape-climb allowance. These are exercise planning assumptions, not operator dispatch data.

## Reauthoring and verification

Use an isolated Python environment with `tools/terrain/requirements-okanagan.txt`:

```sh
python tools/terrain/fetch_okanagan_scenery.py
python tools/terrain/fetch_okanagan_resorts.py
python tools/terrain/test_okanagan_scenery.py
```

The first command authors central terrain and Peachland; the second extends the valley and restores
all resort patches. Both must finish before staging. Public services are contacted only by authoring
scripts. Cached responses and their SHA-256 hashes are retained locally; source/runtime products are
written byte-for-byte. Overpass is queried sequentially with a 30-second gap, never by the game.
The legacy 33 × 33 importer now refuses to overwrite this hierarchy.

For silent visual inspection run `node tools/terrain/preview_okanagan.mjs`, then
`node tools/terrain/scenery_qa.mjs`. The preview uses the production renderer without a flight or
an audio graph. Browser captures are still required after changing material, mesh or texture code.
