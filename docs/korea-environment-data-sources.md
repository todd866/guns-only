# Korean terrain and weather substrate: source and ingestion plan

Status: research handoff, checked 2026-07-19. No data was downloaded for this document.

This is an engineering source plan, not legal advice. Every automated fetch must still record the exact product release and the licence or rights statement in force on the fetch date.

## Recommendation in one page

Build one geographically stable Korean substrate, then put 1950s and 2030s state on top of it as era deltas. Do not make two unrelated maps. Relief, drainage topology, coast geometry and geographic coordinates belong to the shared substrate; vegetation, reservoirs, reclaimed coast, roads, settlements, damage and military features belong to dated layers with provenance and confidence.

The smallest useful first land area is a Kaesong–Iron Triangle–Hwachon corridor:

- Runtime crop: `126.50–127.80 E, 37.85–38.75 N`.
- Approximate extent at 38.3 N: 113 km east–west by 100 km north–south.
- Working CRS: WGS 84 / UTM zone 52N (`EPSG:32652`), with the WGS 84 bounding box retained in metadata.
- Source acquisition envelope: four source-aligned one-degree cells, `N37E126`, `N37E127`, `N38E126`, and `N38E127`; crop only after checksums and provenance are recorded.
- Runtime partition: 8 km or 16 km square chunks with one-sample overlap, skirts and deterministic LODs.

That compact crop includes or reaches the immediate approaches to Kaesong, the Imjin/Hantan system, Chorwon, Kumhwa, the Iron Triangle ridges and Hwachon. It crosses the historical front and the modern DMZ, exercises steep terrain masking, river valleys, road chokepoints and rapidly changing weather, and avoids making Seoul-scale urbanisation a prerequisite. The U.S. Army Center of Military History's [*Restoring the Balance*](https://history.army.mil/Portals/143/Images/Publications/Publication%20By%20Title%20Images/K%20Pdf/CMH_Pub_19-9.pdf) is a useful primary institutional account of the central Korean terrain, primitive weather-sensitive roads and the Hwachon/central-front fighting.

Use this default stack:

1. Copernicus DEM GLO-30 for the primary 30 m surface and its error/edit/water masks; NASADEM as an independent check and fallback.
2. Natural Earth for coarse topology, JRC Global Surface Water for observed modern water occurrence, and DEM-derived drainage for inland hydrography.
3. GEBCO 2026 for offshore bathymetry only, never for navigation or close-in harbour fidelity.
4. ESA WorldCover plus Sentinel-2 for the modern material layer; Landsat and GHSL for change through time.
5. Library of Congress Army Map Service sheets and rights-cleared NARA aerials for the 1950s roads, settlements, shorelines and vegetation interpretation.
6. GHSL for a globally consistent modern settlement prior, with OpenStreetMap in its own attributable ODbL-derived layer for roads and named features.
7. ERA5 pressure levels for the atmospheric truth field, ERA5-Land for surface state, then KMA, NOAA ISD and IGRA observations for bias checks rather than as seamless coverage.
8. IBTrACS plus JMA RSMC Tokyo best tracks for Western Pacific storm scenarios.

The critical simulation rule is that source resolution is not runtime truth resolution. A 0.25-degree reanalysis can drive a plausible synoptic state; it cannot locate a particular tactical cloud, gust or rotor. Downscale deterministically, attach uncertainty, and keep the scenario's hidden atmospheric truth separate from the forecast, briefing and aircraft observations available to the player.

## Source policy labels

The tables use three repository policies:

- **Commit-derived:** small runtime products may be committed when the stated notices and attribution travel with them. Raw source files normally remain out of Git even when redistribution is permitted.
- **Fetch/build only:** retrieve a pinned version into an immutable external cache; commit the recipe, identifiers, checksums and attribution, not the raw data. This is often a size or update-frequency choice rather than a rights prohibition.
- **Reference only until cleared:** a human may use the item during authoring, but it cannot influence a redistributable runtime dataset until an item-specific rights record is captured.

“Open portal,” “free download,” and “government data” are not licence classes. A dataset enters the build only after a machine-readable source record says what may be redistributed.

## Elevation and vertical reference

| Owner and product | Resolution, time and format/access | Rights and repository policy | Recommended use and caveats |
|---|---|---|---|
| European Union/ESA, [Copernicus DEM GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | Global 1 arc-second, nominal 30 m, 1 x 1-degree GeoTIFF or DTED cells; WGS 84 horizontal, EGM2008 vertical. Principal TanDEM-X acquisition was 2011–2015, with older infill. OData and S3 bulk access require a registered Copernicus Contributing Missions user and licence acceptance. | The [GLO-30 full, free and open licence](https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf) grants reproduction, distribution, public communication, modification and combination worldwide without a time limit. Distribution requires the exact source notice, modified-data notice where applicable, no implied endorsement, and the supplied no-liability notice. **Commit-derived is permitted only with those notices.** Keep raw tiles fetch/build only by default. | Primary terrain surface because it includes editing, filling, height-error and water-body masks. It is a DSM: buildings, infrastructure and vegetation are part of the measured surface. Do not interpret it as bare 1950 ground. The published absolute vertical accuracy is under 4 m at 90% and horizontal accuracy under 6 m at 90%, but local error and infill masks matter more than the headline value. |
| NASA/JPL/LP DAAC, [NASADEM HGT v001](https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001) | Global 1 arc-second, nominal 30 m, 1 x 1-degree `HGT`-style flat binary cells with 3,601 rows/columns; February 2000 SRTM acquisition reprocessed with newer control and void filling. Merged integer height is relative to EGM96. Earthdata login/API or AppEEARS. | NASA-led Earth science data are normally CC0 unless marked otherwise under the [NASA Earthdata data-use policy](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy); LP DAAC has confirmed NASADEM as CC0. Citation is strongly requested. **Commit-derived is legally simple**, but raw files remain fetch/build only for size and provenance. | Independent vertical and artefact check, and fallback if Copernicus access changes. Preserve NASADEM's source/NUM and water masks. It is also radar-derived surface elevation, not a guaranteed bare-earth DTM. Void fills can come from other DEMs and must not silently outrank Copernicus quality masks. |
| NASA/USGS, [SRTMGL1 v003](https://www.earthdata.nasa.gov/centers/lp-daac) | Global 1 arc-second cells, 3,601 x 3,601 samples, February 2000, WGS 84/EGM96. The [SRTM collection guide](https://lpdaac.usgs.gov/documents/179/SRTM_User_Guide_V3.pdf) documents formats and filling. | Same NASA Earthdata policy; cite the exact DOI/product. Some historical void-fill inputs had different source restrictions, which is why the product's own version and metadata must be locked. **Fallback/cross-check, fetch/build only.** | Use only if NASADEM is unavailable or to diagnose NASADEM processing changes. Do not average multiple DSMs merely to look “more accurate”; retain per-cell source and confidence. |
| NGA, [EGM2008 and EGM96](https://earth-info.nga.mil/?action=wgs84&dir=wgs84) | Global geoid models and interpolation grids. NGA provides a 2.5-minute EGM2008 grid and 15-minute EGM96 grid plus coefficients and software. | U.S. government source; record the exact downloaded artefact and terms. A pinned PROJ/proj-data release may implement the transformation, but its grid licences must also be retained. **Tool/input fetch/build only.** | Choose EGM2008 as canonical orthometric height. Convert NASADEM/SRTM EGM96 heights before comparison or fusion. Never label ellipsoidal WGS 84 height as MSL. Store `horizontal_crs`, `vertical_crs`, transform grid and software version in every derived tile. |

Copernicus DEM is an appropriate primary even though NASADEM is simpler legally: it has better accompanying quality masks and an explicit free/open distribution grant. NASADEM remains necessary because a second acquisition and processing lineage is the quickest way to find ridge artefacts, datum mistakes and bad infill. If the project cannot ship Copernicus's required notices correctly, switch the committed runtime terrain to NASADEM rather than omitting attribution.

Terrain conditioning must be conservative. Remove isolated spikes, enforce river monotonicity only where hydrography supports it, and keep a patch ledger. Do not blanket-smooth ridges that matter to masking, low flying or forced-landing decisions. A correction becomes an authored patch with reason, source, before/after statistics and reviewer, not an untraceable paint stroke.

## Coastline, rivers and water

| Owner and product | Resolution, time and format/access | Rights and repository policy | Recommended use and caveats |
|---|---|---|---|
| Natural Earth contributors, [1:10m physical vectors](https://www.naturalearthdata.com/downloads/10m-physical-vectors/) | Global shapefiles for coastline, land, lakes and river/lake centerlines at nominal 1:10 million cartographic scale. Versioned ZIP downloads. | All Natural Earth raster and vector data are public domain under its [terms of use](https://www.naturalearthdata.com/about/terms-of-use/). Credit is optional but desirable. **Commit-derived or raw subsets.** | Stable coarse topology, low-LOD horizon/coast silhouette and a sanity check. It is far too generalized for landings, estuaries, tactical river crossings or harbour geometry. Keep political/maritime boundaries out of the physical-water layer. |
| European Commission JRC, [Global Surface Water 1984–2024](https://global-surface-water.appspot.com/download) | Global 30 m Landsat-derived occurrence, seasonality, recurrence, transitions, change and maximum-extent rasters; tiled GeoTIFF/WMTS/Google Earth Engine access. | Produced under Copernicus and supplied free of charge without restriction of use; published maps should credit `Source: EC JRC/Google` and cite the dataset paper. **Commit-derived with attribution; raw fetch/build only.** | Modern water mask and confidence, seasonal inundation, reservoir and reclaimed-shore change detection. The series begins in 1984, so it cannot establish a 1950 shoreline. Snow, cloud, turbidity and narrow rivers create classification gaps. |
| IHO/IOC GEBCO, [GEBCO_2026 Grid](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid) | Global 15 arc-second (~450 m) pixel-centred bathymetry/topography, April 2026; NetCDF4, GeoTIFF, Esri ASCII, subset app and OPeNDAP. A Type Identifier grid records broad source class. | The grid is placed in the public domain and may be copied, adapted and commercially exploited under the [terms of use](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use); acknowledgement is required. **Commit-derived with attribution; raw fetch/build only.** | Offshore depth field for horizon colour, waves, naval placement and future carrier areas. GEBCO explicitly says it is not for navigation. Korean shelf and shallow-water cells may be interpolated from sparse data and mixed vertical datums; do not use it to score ship grounding or reproduce a port. |
| Derived drainage from the selected DEM | Flow direction, accumulation, catchments and stream candidates at the terrain working resolution; generated in EPSG:32652. | Licence inherits input obligations and the project's authored processing. **Commit-derived with full lineage.** | This is the high-resolution inland network, but it is only a candidate. Burn in rights-cleared historical/modern water, preserve natural divides, and manually QA Hantan/Imjin/Pukhan/Hwachon connectivity. Never infer legal boundaries from a river centreline. |

Reservoirs, dams, reclaimed coast and channel engineering need era dates. A water polygon should carry `valid_from`, `valid_to`, `source_id`, `confidence`, and whether it is an observed outline, a map trace or a simulation approximation. Terrain meshes should not permanently bake a modern reservoir into the shared relief; put its water surface and any locally edited bed in an era patch.

## Land cover, forests and surface material

| Owner and product | Resolution, time and format/access | Rights and repository policy | Recommended use and caveats |
|---|---|---|---|
| ESA consortium, [WorldCover 2020 v100 / 2021 v200](https://esa-worldcover.org/en/data-access) | Global 10 m land-cover classification and annual composites, delivered as tiled Cloud-Optimized GeoTIFFs/Zenodo packages. | CC BY 4.0, with the exact `© ESA WorldCover project [year] / Contains modified Copernicus Sentinel data...` attribution specified on the access page. **Commit-derived with attribution; raw fetch/build only.** | Default modern material/vegetation prior. Keep its class-confidence and provenance; do not treat a 10 m class as an exact tree line. It is a 2020/2021 state, not a 1950 reconstruction. |
| USGS/NASA, [Landsat Collection 2](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-1-data) | Global scenes from 1972 to present. Collection 2 Level 1 and Level 2 products use Cloud-Optimized GeoTIFF plus metadata/QA; MSS is coarser, later sensors are usually 30 m multispectral. EarthExplorer, LandsatLook and cloud access. | USGS states there are no restrictions on Landsat product use and treats them as public domain; source citation is requested. **Commit-derived; raw scenes fetch/build only.** | Long-run forest, reservoir, settlement and coast-change evidence. It still starts two decades after the Korean War. Use it to constrain what changed between early postwar and modern states, not to reverse-engineer a precise 1950 surface. Lock Collection 2 processing level and scene IDs. |
| European Union/ESA, [Copernicus Sentinel-2](https://dataspace.copernicus.eu/) | Global optical imagery since 2015, 10/20/60 m bands, SAFE/JP2 products and API/cloud access. | The [Sentinel legal notice](https://cds.climate.copernicus.eu/licences/ec-sentinel) grants free, full and open reproduction, distribution, communication, adaptation and combination, including commercial use, with source/modified-data notice. **Commit-derived with notice; raw fetch/build only.** | Modern high-detail interpretation and WorldCover correction. Seasonal crop state, snow, haze, shadows and cloud require multiple dates. Do not let one clear scene become an eternal material map. |
| Korea Forest Service, [history of Korean forest policy](https://english.forest.go.kr/kfsweb/kfi/kfs/cms/cmsView.do?cmsId=FC_001680&mn=UENG_02_01_01) | Institutional history and statistics rather than a runtime raster. | Website/publication rights must be checked item by item. **Authoring reference.** | Supports the essential era distinction: modern South Korean forest density cannot simply be back-projected into a war-era landscape affected by long degradation and subsequent restoration. The corresponding DPRK history and local variation remain much less certain. |

Use a shared geomorphology layer and two dated surface-state packages:

- `korea-1950`: manually interpreted historical forest density, cultivation, bare slopes, settlement footprint, roads and water state, each with confidence.
- `korea-2030`: WorldCover/Sentinel/Landsat-derived materials and phenology, modern reservoirs/reclamation and built surface.

Canopy height and building height belong above the ground mesh. Otherwise a modern radar DSM plus a rendered forest double-counts tree height, and a 1950 tile inherits 2010s canopy. A practical first pass is to low-pass only the DSM component correlated with modern vegetation/building masks, retain the unmodified source and uncertainty, and tune against NASADEM rather than claiming a true DTM.

## Historical 1950s maps and aerial photography

| Owner and product | Resolution, time and format/access | Rights and repository policy | Recommended use and caveats |
|---|---|---|---|
| U.S. Army Map Service via Library of Congress, [Korea 1:25,000, Series L851](https://www.loc.gov/item/2007631783/) | 1952 onward; individual colour topographic sheets with contours, spot heights, roads, settlements, hydrography and bilingual names. The item exposes high-resolution images, metadata and a IIIF presentation manifest. | The item states that Geography and Map Division digitized content is free to use/reuse unless an item Rights Advisory says otherwise, and requests the Library of Congress credit line. **Scans fetch/build only; rights-cleared traces and small source excerpts may be committed.** | Primary authoring source for war-era features. Georeference each sheet from printed grid/control, retain residual error, edition and sheet ID, and never warp the modern DEM to fit a paper map. Map compilation date may predate publication; military edits and transliteration vary. |
| U.S.-flown foreign aerial photography, NARA Record Group 373, [research guide](https://www.archives.gov/research/cartographic/aerial-photography/rg-373-dia-foreign-aerial-photography) | Foreign aerial photography 1935–1970. Coverage is located by degree-square overlay index, then mission, spot number, can and exposure; much material requires an on-site or paid scan. | Federal works are generally public domain, but NARA [does not guarantee item copyright](https://www.archives.gov/research/still-pictures/permissions) and some holdings contain third-party or donor rights. **Reference only until the exact exposure's creator and restrictions are logged; then fetch/build, with derived traces commit-capable if cleared.** | Best potential evidence for vegetation, villages, roads, bridges and damage near an exact sortie date. The archive is not a seamless orthophoto. Frame geometry, camera calibration, relief displacement and scan quality require photogrammetric work; absence from the online catalog is not absence of coverage. |
| NARA Record Group 319, [Army Staff still-picture aerial reconnaissance](https://www.archives.gov/research/cartographic/aerial-photography/still-pictures-rg319-aerial-photography) | Ground and aerial reconnaissance views including Korea, with captions that can include date, map coordinates, rivers or towns; access is finding-aid/research-room led. | Same item-level NARA rights rule. **Reference only until cleared.** | Useful for local qualitative appearance and feature confirmation, less suitable than vertical mapping frames for geometry. |
| USGS EROS, [Declassified Satellite Imagery 1](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-declassified-data-declassified-satellite-imagery-1) | CORONA/ARGON/LANYARD, 1960–1972; roughly 2–12 m for many CORONA systems but product-dependent. Unrectified photogrammetric TIFF scans via EarthExplorer; some scans are on-demand. | USGS marks the collection public domain. **Raw fetch/build only; commit derived vectors/low-volume products with citation.** | Not a 1950s source. It is valuable near-era validation for reconstruction, particularly where 1972 Landsat is too coarse, but a 1960s road or settlement must not be assigned to 1950 without another source. |

Historical ingestion should produce vector and confidence layers, not a single painted “old Korea” texture. Every trace must retain sheet/frame ID, observation date or date interval, georeferencing RMS, interpreter, and class confidence. Where sources disagree, keep both claims and adjudicate in the era build. Destruction and temporary military works belong to scenario deltas, not the baseline 1950 pack.

## Settlements, roads and names

| Owner and product | Resolution, time and format/access | Rights and repository policy | Recommended use and caveats |
|---|---|---|---|
| European Commission JRC, [GHS-BUILT-S R2023A](https://human-settlement.emergency.copernicus.eu/ghs_buS2023.php) | Global built-up surface for 1975–2030 at five-year intervals, based on Landsat/Sentinel-2 and interpolation/extrapolation. Observed 2018 anchor is available at 10 m; multitemporal epochs at 100 m and 1 km, TIFF in World Mollweide/WGS 84 variants. | GHSL is open/free; reuse is authorised with source acknowledgement under the [EC reuse policy](https://commission.europa.eu/legal-notice_en), normally CC BY 4.0 unless otherwise marked. **Commit-derived with citation; raw fetch/build only.** | Globally consistent built-up prior on both sides of the border and a useful density/confidence field. The 2025/2030 values are model projections, not observations. The nominal 1975 epoch uses imagery from a span around that date and cannot substitute for a 1950 settlement map. |
| OpenStreetMap contributors, [OSM database](https://www.openstreetmap.org/copyright) | Current volunteer-contributed roads, rails, buildings, waterways, landuse, places and names. Planet/regional PBF extracts and minutely/daily replication diffs. | ODbL 1.0 requires attribution and share-alike for publicly used derivative databases. A produced work can carry different terms, but the OSM data/derivative database must remain available as required. See the OSMF [licence FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ). **Fetch/build only and isolated as an ODbL layer unless the project intentionally publishes the derivative database.** | Detailed modern road/name supplement. DPRK completeness, tagging and recency vary sharply by place. Never merge OSM roads into a closed proprietary “master roads” database with no way to satisfy ODbL. Prefer separate feature-type layers and record the replication timestamp. Do not scrape `tile.openstreetmap.org`. |
| Natural Earth, [1:10m cultural vectors](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/) | Coarse global roads, railways, populated places and related cartographic layers in shapefile format. | Public domain under Natural Earth terms. **Commit-capable.** | Low-LOD labels and topology when OSM is absent; not tactical road geometry. Political boundaries and disputed lines must remain source-specific claim layers, never silently become physical terrain. |
| South Korean NGII/VWorld/NSDI and other national portals | Potentially high-resolution ROK roads, parcels, imagery and elevation; formats and access differ by dataset/API. | Korean public works may carry KOGL Type 1–4, API terms, third-party rights or security/export limits. A portal being public is insufficient. **Reference or fetch/build only until the exact product has a captured KOGL/redistribution record.** | Valuable ROK authoring reference and QA. Do not create an asymmetric “truth standard” in which ROK national precision is presented as equivalent to much sparser DPRK data. Preserve a source-confidence surface. |

Names are versioned data. Store Korean script, Revised Romanization or source romanization, historical form, language, validity interval and source. Do not overwrite 1950 sheet names with modern OSM names, and do not encode the DMZ, Military Demarcation Line, Northern Limit Line or other disputed claims as one uncontested physical boundary. A scenario chooses a displayed/operational claim layer; the terrain does not.

## Weather, upper air and climate

| Owner and product | Resolution, time and format/access | Rights and repository policy | Recommended use and caveats |
|---|---|---|---|
| ECMWF/Copernicus Climate Change Service, [ERA5 hourly pressure levels](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels) | Global 0.25-degree reanalysis, hourly, 1940–present; 37 pressure levels from 1,000 to 1 hPa; GRIB through the Climate Data Store API, with ensemble uncertainty fields at coarser resolution. | Dataset page specifies CC BY and DOI `10.24381/cds.bd0915c6`; CDS registration/API credentials are required. **Raw fetch/build only; compact derived scenario fields may be committed with attribution and modification notice.** | Primary 4D synoptic truth: wind, temperature, humidity and geopotential profiles for IAS/TAS, density altitude, wind shear, cloud and storm forcing. Early-war and DPRK cells have less observational constraint. A 0.25-degree cell is tens of kilometres wide and cannot resolve valley wind, rotor, sea breeze or an individual cumulonimbus. |
| ECMWF/Copernicus, [ERA5-Land hourly](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land) | Global 0.1-degree (~9 km native) land reanalysis, hourly, 1950–present; 2 m/10 m and four soil layers to 2.89 m; GRIB. | Dataset page specifies CC BY and DOI `10.24381/cds.e2161bac`. **Raw fetch/build only; derived scenario fields commit-capable with attribution.** | Surface temperature, snow, soil moisture, runoff and ground flux prior. It is a land-model replay forced by ERA5, not an independent observation set and not an upper-air source. Its own documentation warns that uncertainty increases backward in time. |
| Korea Meteorological Administration, [Open MET Data Portal](https://data.kma.go.kr/resources/html/en/aowdp.html) and [ASOS](https://data.kma.go.kr/data/grnd/selectAsosRltmList.do?pgmNo=36&tabNo=2) | ASOS offers minute/hour/day/month/year data, with station/element-dependent records from 1904, 105 current listed stations, CSV/file sets and APIs. Elements include pressure, temperature, wind, humidity, precipitation, clouds, visibility, snow and radiation with QC flags for key fields. | KMA's [copyright policy](https://www.kma.go.kr/kma/guide/copyright.jsp) permits free reuse with specific attribution only where KMA owns all rights and the work carries KOGL Type 1. KOGL Types 2–4 add restrictions; unmarked items require prior agreement. **Fetch/build only by default; commit only an item whose KOGL marker and required credit are in the source lock.** | Best ROK station truth and climate calibration. Coverage is point-based, networks/instruments change, and an observation at an airport is not a terrain-following wind field. Keep QC flags and station-history metadata. |
| Korea Meteorological Administration, [rawinsonde file sets](https://data.kma.go.kr/data/hr/selectRdsdList.do?pgmNo=43) | CSV yearly files; typically 00/12 UTC profiles of pressure, temperature, dewpoint and wind to over 30 km, station/period dependent. | Same per-item KOGL gate. **Fetch/build only by default.** | Local profile bias check and plausible briefing soundings. Stations are sparse and predominantly ROK; never interpolate one sounding into tactical truth without terrain/reanalysis context. |
| Korea Meteorological Administration, [North Korea 1991–2020 climate normals](https://data.kma.go.kr/resources/normals/pdf_data/northkorea_pdf_0104.pdf) | Published climatological tables for DPRK stations/variables, 30-year normals; PDF rather than a seamless field. | Verify the publication's KOGL marker before extracting and redistributing tables. **Authoring/reference until cleared.** | Valuable seasonal sanity check across DPRK and evidence about missing/replaced observations. Normals cannot recreate a specific sortie and their own substitution/missing-data methods must be preserved. |
| NOAA NCEI, [Integrated Surface Database](https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database) | Global hourly/synoptic surface reports, 1901–present, over 20,000 downloadable stations; full ASCII and simpler fixed-width ISD-Lite, HTTPS/API. Variables include wind, temperature/dewpoint, pressure, cloud, visibility, weather, precipitation and snow. | NOAA-created data are generally U.S. public-domain material unless a product says otherwise; cite NCEI and the exact subset. **Raw fetch/build only; small cleaned scenario observations commit-capable with provenance.** | War-era station observations and independent KMA check. Coverage grows sharply in the 1940s/1970s but has station gaps and breaks. DPRK and early-war records are sparse and mixed-source. Preserve flags and never treat missing as calm/clear. |
| NOAA NCEI, [IGRA v2.2](https://www.ncei.noaa.gov/products/weather-balloon/integrated-global-radiosonde-archive) | More than 2,800 global land/ship stations, earliest 1905, plain-text station soundings plus monthly means and derived parameters; pressure, height, temperature, humidity and wind at reported levels. HTTPS bulk access. | NOAA public-domain default; cite DOI `10.7289/V5X63K0Q` and subset/access date. **Raw fetch/build only; derived profiles commit-capable.** | Upper-air observation check, especially for lapse rates, tropopause and winds aloft. Record lengths, instruments, vertical resolution and station locations change. Remaining discontinuities and Korean spatial sparsity make IGRA a constraint, not a seamless atmosphere. |
| NOAA/NCEP/NCAR, [Reanalysis 1](https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html) | Global 2.5-degree, four times daily, 17 pressure levels, 1948–17 March 2026; CF NetCDF4. NOAA PSL lists no usage restrictions and requests acknowledgement. | **Fetch/build only; derived diagnostics commit-capable with citation.** | Very coarse independent check on 1950–53 synoptic regimes. It is not a tactical weather source. Early 1948–57 handling differs, and NOAA stopped production in March 2026; pin the final archive rather than expect ongoing updates. |
| NOAA/CIRES/DOE, [20th Century Reanalysis v3](https://www.psl.noaa.gov/data/gridded/data.20thC_ReanV3.html) | 1836–2015, approximately 75 km model resolution, 64 vertical levels and 80 ensemble members; NetCDF/NOAA PSL access. | NOAA distribution with requested acknowledgement; lock the exact stream/version. **Fetch/build only.** | Use the ensemble as an uncertainty envelope for sparse-observation historical cases, not as a higher-resolution replacement for ERA5. Disagreement among ERA5, NCEP/NCAR and 20CR is useful information to expose in scenario confidence. |
| NOAA NCEI, [IBTrACS v4r01](https://www.ncei.noaa.gov/products/international-best-track-archive) | Global merged tropical-cyclone best tracks, agency fields and derived parameters; NetCDF, CSV and shapefile; historical to current with regular updates. | Publicly available NOAA dataset; cite DOI `10.25921/82ty-9e16`, subset and access date. **Pinned releases or derived tracks may be committed with citation.** | Cross-agency storm catalogue and provenance. Agency wind-averaging periods, revisions and early-record quality differ; retain source-specific fields instead of collapsing to one “correct” intensity. |
| Japan Meteorological Agency RSMC Tokyo, [Western North Pacific best-track text](https://www.jma.go.jp/jma/jma-eng/jma-center/rsmc-hp-pub-eg/besttrack.html) | 1951–present text/ZIP best tracks with documented fixed-column format and revision history. | JMA's [website terms](https://www.jma.go.jp/jma/en/copyright.html) use Japan's Public Data License 1.0 unless a specific notice overrides it, require source/edited-content citation, and state compatibility with CC BY 4.0. **Pinned raw or derived subsets can be committed after confirming no item-specific override.** | Authoritative regional comparison for Western Pacific storms, including the war era. Best track is retrospective analysis, not the forecast a pilot would have received. Preserve revision date and do not normalize 10-minute winds into another convention without retaining the original. |

KMA's portal also exposes AWS, aviation, satellite, radar, numerical model and typhoon products. Those are attractive for modern validation, but they should not become base dependencies until the exact product's KOGL class, retention, API quota and redistribution rights are locked. Operational feeds change faster than climate archives.

## Turning source weather into a decision-making simulation

The player should experience the information available to an experienced pilot, not direct omniscience over the atmosphere. Each scenario therefore needs three related but distinct products:

1. **Hidden environmental truth.** A deterministic four-dimensional field of pressure, temperature, humidity, wind, turbulence, cloud condensate/coverage, precipitation and surface state. ERA5/ERA5-Land provide the synoptic anchor; terrain-aware downscaling adds valley flow, ridge acceleration, rotor risk, lapse-rate adjustment and stochastic convective structure. The seed and algorithm version are part of the scenario ID.
2. **Planning/forecast product.** A deliberately lower-resolution, earlier-cycle estimate with uncertainty, fronts, winds/temperatures aloft, cloud layers, freezing level, visibility and hazards. For a 1950 scenario it can be text/chart-like and sparse; a 2030 force can have richer model fields but still suffers latency, denied sensors, deception and datalink loss.
3. **Aircraft observation.** What onboard instruments, sight, radio reports and datalink actually reveal, with sensor error, icing/blockage/failure modes and update latency. IAS then follows local static/dynamic pressure; TAS, Mach, density altitude, fuel/engine performance and ground speed emerge from the same atmospheric state.

Never manufacture 1 km certainty by interpolating a 25 km reanalysis. Mark subgrid cloud, gust and turbulence as generated conditional structure. Calibrate distributions against nearby ASOS/ISD/IGRA and KMA normals, but do not force every scenario to match a single station exactly. A mountain-wave or storm scenario should store the truth seed plus the evidence/assumptions that justify its intensity.

Cloud geometry can be driven by humidity, stability, vertical motion, cloud fraction, convective indices and precipitation from the atmospheric anchor, then created at runtime with seeded cells/layers. Storm tracks constrain the large-scale case. They do not dictate exact cloud positions. This preserves repeatability for training and after-action review while leaving genuine forecast uncertainty.

## Reproducible ingestion and attribution

### 1. Source lock

Before a fetcher exists, define a source-lock record with at least:

```yaml
id: cop-dem-glo-30-2024_1
owner: European Union / ESA / DLR / Airbus Defence and Space
product_id: COP-DEM_GLO-30-DGED
release: 2024_1
aoi_wgs84: [126.50, 37.85, 127.80, 38.75]
acquisition_cells: [N37E126, N37E127, N38E126, N38E127]
access_url: https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
fetched_at: null
sha256: null
horizontal_crs: EPSG:4326
vertical_crs: EPSG:3855
licence_url: https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf
licence_class: attribution-and-liability-notice
artifact_policy: commit-derived
required_notices:
  - "produced using Copernicus WorldDEM-30 ..."
  - "The organisations in charge of the Copernicus programme ... do not incur any liability ..."
```

The real notice strings must be copied in full from the licence, not abbreviated as above. Add product DOI, station/scene/sheet/frame IDs, time range, provider revision, access method, format, native nodata, units, processing level, rights-advisory snapshot hash and contacts when applicable.

### 2. Fetch without secrets in Git

- Read Earthdata, Copernicus/CDS and KMA tokens only from environment variables or the developer's credential store.
- Download into a content-addressed cache outside the repository, first to a temporary name and then atomically rename after SHA-256 verification.
- Keep HTTP metadata, provider checksum, byte count and fetch timestamp beside the cached object.
- Fail closed if a licence/KOGL class is absent, changed or conflicts with `artifact_policy`.
- For mutable endpoints such as OSM, IBTrACS or operational KMA, lock a dated snapshot/replication sequence. Never build release assets from an unpinned `latest` URL.

### 3. Normalize geometry and height

- Retain an untouched WGS 84 footprint for every source.
- Transform the MVP crop to EPSG:32652 using pinned GDAL/PROJ versions.
- Convert all heights to EGM2008 orthometric metres before comparison. Record the source datum and geoid grid; reject unknown vertical datums.
- Snap the canonical working raster to a declared origin and resolution. Use explicit resampling per data type: cubic/bilinear may be reasonable for continuous height, nearest for classes and masks, conservative aggregation for fractions.
- Preserve nodata and quality/error masks through every step. A filled pixel is not equivalent to an observed pixel.

### 4. Build shared and era layers

- Condition terrain hydrology with the smallest documented edits necessary.
- Produce shoreline, water, slope, curvature, roughness, drainage and terrain-confidence fields.
- Keep 1950 and 2030 land cover, forest, roads, settlement, reservoir, reclamation and damage as separate dated layers.
- Keep OSM-origin feature types in a separate database/layer with ODbL attribution and an offer/source path satisfying share-alike obligations.
- Generate 8/16 km runtime chunks, multiple mesh/height LODs, physics collision surface, terrain-material masks and per-chunk source/confidence metadata.
- Generate compact weather cases by extracting only the required ERA5 variables, times, levels and uncertainty; store the downscaler version and seed.

### 5. Generate notices, do not hand-maintain them

Build outputs should produce both machine-readable `provenance.json` and human-readable `ATTRIBUTION.md` from the source lock. The game needs an accessible credits/data-sources view, and exported screenshots/reports should carry required attribution where a licence demands it. CI should fail if a runtime chunk references a source whose required notice is missing.

### 6. QA gates

- Exact reproducibility: same locked inputs and toolchain produce byte-identical or explicitly tolerance-bounded outputs.
- Raster seams: no height, normal, material, water or LOD cracks across chunks.
- Hydrology: major rivers flow downhill, reservoirs close, and no implausible cross-divide channels appear.
- Vertical datum: Copernicus/NASADEM residuals are inspected after, not before, datum conversion.
- Surface semantics: no modern DSM canopy/building height is rendered twice or assigned to 1950 by accident.
- Historical fit: traced features report sheet/frame residual and confidence; uncertain geometry remains visibly uncertain in authoring tools.
- Weather physics: hydrostatic consistency, pressure/temperature continuity, valid humidity, smooth synoptic boundaries and bounded subgrid perturbations.
- Rights: every committed binary is reachable from a licence-approved source record; ambiguous items stop the build.

## What belongs in Git

| Artifact | Commit? | Reason |
|---|---:|---|
| Source-lock manifests, AOI GeoJSON, product/station/scene/sheet/frame IDs, fetch recipes and SHA-256 values | Yes | These are the reproducibility spine and are small. |
| Licence snapshots or stable URLs, exact required notices, attribution generator and rights-decision records | Yes | A build is not reproducible if its legal inputs are implicit. Respect a licence's own redistribution terms for the licence text. |
| Fetch/transform/downscale code and pinned container/tool versions | Yes | Required to regenerate and audit the substrate. |
| Small runtime terrain/material/confidence chunks derived solely from Copernicus GLO-30, NASA, Natural Earth, GEBCO, JRC, ESA WorldCover, Sentinel or other sources whose redistribution terms are satisfied | Yes, after notice gate | This is the actual game substrate; carry provenance in or beside every pack. |
| Public-domain/rights-cleared historical vectors manually traced from LOC/NARA/USGS items | Yes | Retain exact item/exposure citations and interpretation confidence. |
| Compact derived ERA5/ERA5-Land/NOAA/JMA weather scenario fields | Yes, after attribution gate | Small, deterministic training cases are preferable to runtime network calls. Preserve modification notices and DOI/subset details. |
| Raw Copernicus DEM, NASADEM, WorldCover, Landsat, Sentinel, ERA5, KMA, GHSL and imagery archives | No by default | Large, replaceable build inputs; store in content-addressed cache even if redistribution is legal. |
| LOC high-resolution scans, NARA frames and CORONA TIFFs | No | Large authoring inputs; NARA also needs item-level rights clearance. |
| OSM PBF and any publicly used derivative road/feature database | Not in the normal base pack | Keep a clearly licensed ODbL distribution/source path and separate it from non-OSM feature databases. A separately published ODbL artefact is possible by design. |
| South Korean national portal outputs without an exact KOGL Type 1 or explicit redistribution record | No | Public access does not establish commercial redistribution rights. |
| API tokens, cookies, user profiles, signed URLs, temporary credentials and raw operational caches | Never | Secrets and ephemeral provider state. |
| Contemporary commercial basemap imagery or ambiguous-rights scans | Never | Authoring reference only unless independently licensed. |

## DPRK and historical uncertainty that must remain visible

The north side of the substrate will not have the same evidence density as the south. Hiding that asymmetry would produce a false sense of authority.

- DPRK ground stations and radiosondes are sparse in globally accessible archives; reanalysis there is more model-dependent, especially in the early record.
- Current roads, buildings and names in OSM vary in completeness and recency. GHSL detects built surface but does not know every road, building purpose or military feature.
- Satellite classifications are affected by snow, agricultural season, shadow, haze and sensor resolution. A class boundary is not a surveyed edge.
- Copernicus DEM/NASADEM are modern DSM acquisitions. Terrain relief is broadly reusable across eras, but forests, buildings, mines, cuts, reservoirs and reclamation are not.
- The 1950 landscape changed during the war. A 1952 map, a 1951 aerial and a baseline “June 1950” scenario are not interchangeable.
- Some historical maps were compiled from older surveys, carry wartime edits or use inconsistent romanisation. Store edition and source date separately.
- Korean shallow-water bathymetry in GEBCO can be interpolation rather than measured survey. Ship and carrier gameplay must use generous uncertainty and authored safe/unsafe regions unless a navigationally suitable source is later licensed.
- Sensitive or disputed boundaries and military sites should be represented as attributed claims or scenario knowledge, not asserted as timeless terrain fact.

Represent source confidence at runtime where it affects decisions. A planning map can honestly show “charted,” “probable,” “reported,” or “unknown”; a 2030 ISR product can update or contradict the prior. That uncertainty is not a weakness in this project. It is material for reconnaissance, route choice, lost-comms procedures, weather decisions and maintenance-test-flight training.

## Suggested first implementation milestone

Without expanding the first milestone beyond one corridor:

1. Lock the four Copernicus GLO-30 and NASADEM cells covering the crop, plus licences and geoid inputs.
2. Generate shared 16 km terrain chunks with height, normals, slope, water candidate, collision LOD and source-confidence masks.
3. Add a 2030 surface layer from WorldCover 2021, Global Surface Water and GHSL 2018/2020; keep OSM disabled until its distribution path is designed.
4. Georeference and trace only the Army Map Service sheets needed for the crop into a sparse 1950 road/settlement/water/forest layer.
5. Create three weather cases over the same terrain: winter northwest flow/low-level turbulence, summer moist convective conditions, and a marginal deck/visibility case. Anchor them in pinned ERA5/ERA5-Land hours and validate profiles against available IGRA/KMA/ISD evidence.
6. Expose provenance and confidence in an authoring lab before polishing terrain visuals. A click on any chunk or feature should answer: source, date, licence, transformation, confidence and era.

This produces one useful geography for both games: a 1950 pilot works with sparse forecasts, maps and visual cues; a 2030 operator has richer but fallible ISR, networks and models. The terrain is shared, the world state is dated, and the player's situational awareness—not graphical imitation of a real cockpit—becomes the central simulation resource.
