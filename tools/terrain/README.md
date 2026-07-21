# Korean terrain build

The runtime terrain is derived from the immutable Copernicus DEM and water-mask objects declared
in `content/sources/korea-terrain-source-lock.json`. Raw GeoTIFFs stay outside Git.

```sh
python3 tools/terrain/fetch_copernicus.py \
  --cache /path/to/content-addressed-cache
python3 tools/terrain/build_korea_terrain.py \
  --cache /path/to/content-addressed-cache
```

The builder requires Python 3, NumPy, Pillow, and SciPy. It verifies every source byte count and
SHA-256 before reading it. Outputs are deterministic, little-endian signed-16-bit decimetre
heights with a dedicated water sentinel:

- `central-front.terrain` is the range-addressable web LOD bundle.
- `central-front.manifest.json` owns offsets, hashes, coordinates, and provenance.
- `central-front.truth` is a compact 128 m simulation grid embedded by the web shell.
- `central-front-preview.png` is a source-derived QA preview, not an imagery texture.

The canonical source lock already declares the whole-peninsula envelope. Additional runtime
regions use the same geodetic index and builder contract; no region invents a second Korea.

## Peninsula atlas and generative scenery

The legacy central-front product remains the small compatibility pack. The scalable path uses
8,192 m tiles with 257 source samples (32 m spacing) inside independently range-addressable
131,072 m pages. A tiny schema-v2 root index selects page manifests; the browser then loads only
nearby height records, looks ahead along aircraft motion, and evicts pages behind the sortie.

Plan the whole source envelope without downloading anything:

```sh
python3 tools/terrain/build_korea_atlas.py \
  --lock content/sources/korea-terrain-peninsula-source-lock.json \
  --region korean-peninsula \
  --dry-plan
```

The locked envelope conservatively plans 11,097 candidate tiles in 60 page cells and approximately
1.95 GB of raw multi-LOD height records. The verified build omits all-water tiles and resolves to
5,679 land-bearing tiles in 40 pages: 999,866,896 bytes of range bundles. Total theatre size does
not become browser working-set size.

Lock the remaining immutable Copernicus objects to a reviewed candidate, build the atlas, and
verify every page manifest, bundle, byte range, scenery seed, and browser budget:

```sh
python3 tools/terrain/lock_korea_atlas_sources.py \
  --cache /path/to/content-addressed-cache \
  --output /path/to/korea-terrain-peninsula-source-lock.json
python3 tools/terrain/build_korea_atlas.py \
  --lock /path/to/korea-terrain-peninsula-source-lock.json \
  --cache /path/to/content-addressed-cache \
  --region korean-peninsula \
  --output /path/to/korea-atlas
python3 tools/terrain/verify_korea_atlas.py \
  /path/to/korea-atlas/korean-peninsula.atlas.manifest.json
```

Each land-bearing chunk carries deterministic terrain metrics and a stable generation seed.
`korea_scenery.js` turns those inputs into instanced scenery only at the closest terrain LOD. The
`1950s` and `modern` (the 2030s F-22/drone theatre) profiles share elevation and water truth while
changing settlement density,
building scale, vegetation recovery, palettes, field geometry, road width and markings, rail,
power infrastructure, and paved versus period airfields. Fields include metre-scale crop rows;
roads and rail follow short terrain-conforming segments; adjacent tiles share deterministic
arterial offsets; and every footprint samples the height/water grid before it can render. The
selected content pack chooses the era; it does not duplicate terrain bytes or download a scenery
service.

All scenery meshes share a small set of geometries and materials and render as instanced batches.
Per-tile caps cover trees, buildings, land-use patches and rows, road and rail segments, power
poles and wires, and runway segments. Mobile, balanced, and desktop tiers raise those caps only
inside the closest terrain ring; coarser LODs carry no object scenery. The profiler reports both
the expected tree/building/field counts from each atlas manifest and conservative closest-ring
instance and draw-batch ceilings for the linear features.

At the central-front reference origin, the profiler reports the following initial height-record
working sets. Page manifests add 1.65 MB. The per-page LRU is capped at eight records, keeping the
worst retained-cache estimate at 4.2 MB mobile, 11.6 MB balanced, and 15.9 MB desktop; geometry is
released behind the aircraft.

| Tier | Radius | Resident chunks | Height records |
| --- | ---: | ---: | ---: |
| Mobile | 69.6 km | 216 | 2.64 MB |
| Balanced | 99.6 km | 468 | 6.50 MB |
| Desktop | 129.6 km | 750 | 12.87 MB |

The modern profile's conservative closest-ring ceiling is below. It assumes every optional road,
rail, power, and airfield batch reaches its per-tile cap at once, so normal sorties are lower.
Instance-matrix memory excludes the shared, sub-megabyte primitive geometry and materials.

| Tier | Closest chunks | Instanced transforms | Matrix memory | Scenery draw-batch ceiling |
| --- | ---: | ---: | ---: | ---: |
| Mobile | 4 | 2,460 | 0.15 MiB | 48 |
| Balanced | 12 | 18,960 | 1.16 MiB | 144 |
| Desktop | 32 | 94,848 | 5.79 MiB | 384 |

Reproduce the measurement at another local-frame position with
`tools/terrain/profile_korea_atlas.py`.

## R2 delivery

Published web packs live in the isolated `guns-only-terrain-prod` Cloudflare R2 bucket. Treat
object keys as immutable: use a version prefix containing the bundle SHA-256, upload every file
with `Cache-Control: public, max-age=31536000, immutable`, and point the game at the manifest. The
manifest's relative URIs keep its bundle and preview in the same version prefix.

For an atlas, produce a verified immutable upload plan first, then execute the same plan with the
authenticated Wrangler session. The default prefix includes the root-manifest SHA-256:

```sh
python3 tools/terrain/publish_korea_atlas_r2.py \
  /path/to/korea-atlas/korean-peninsula.atlas.manifest.json
python3 tools/terrain/publish_korea_atlas_r2.py \
  /path/to/korea-atlas/korean-peninsula.atlas.manifest.json \
  --execute
```

Uploads retry transient Cloudflare failures, publish the root marker only after every dependency,
and can resume a long transfer by combining `--resume-state /path/to/upload-state.json` with
`--resume-public-base-url https://your-public-r2-host/`.

The verified full peninsula is under
`korea-v1-korean-peninsula-atlas-17be648050af5ffa/`. Its root manifest is:

```text
https://pub-5be4f759b3b24bff8e135c34d60fdcbe.r2.dev/korea-v1-korean-peninsula-atlas-17be648050af5ffa/korean-peninsula.atlas.manifest.json
```

The smaller 32 m central-front streaming pilot remains under
`korea-v1-central-front-atlas-8550240a67c8c36c/`. Its temporary public manifest is:

```text
https://pub-5be4f759b3b24bff8e135c34d60fdcbe.r2.dev/korea-v1-central-front-atlas-8550240a67c8c36c/central-front.atlas.manifest.json
```

The `r2.dev` hostname is for validation, not the production game. Before switching the runtime,
attach a Cloudflare-managed custom hostname to the bucket and use that hostname for the manifest.
The account currently has no managed zone, so this is the only remaining infrastructure step.
Until then, append `?terrain=peninsula-r2` to the game URL to opt into the published atlas for a
development sortie; the normal route deliberately retains the local compatibility pack.

Apply and verify the public, read-only browser policy with the repository-owned configuration:

```sh
npx wrangler r2 bucket cors set guns-only-terrain-prod \
  --file tools/terrain/r2-cors.json
npx wrangler r2 bucket cors list guns-only-terrain-prod
```

The wildcard origin is intentional for public terrain bytes. The bucket remains read-only over
HTTP, while writes continue to require authenticated Cloudflare tooling. `GET`, `HEAD`, and the
`Range` request header are the only browser capabilities the runtime needs.

Required notice for these modified products:

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
> 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

The organisations in charge of the Copernicus programme by law or by delegation do not incur any
liability for any use of the Copernicus WorldDEM-30.
