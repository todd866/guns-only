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

## R2 delivery

Published web packs live in the isolated `guns-only-terrain-prod` Cloudflare R2 bucket. Treat
object keys as immutable: use a version prefix containing the bundle SHA-256, upload every file
with `Cache-Control: public, max-age=31536000, immutable`, and point the game at the manifest. The
manifest's relative URIs keep its bundle and preview in the same version prefix.

The first verified pilot is under
`korea-v1-central-front-18dc413e6ac15110/`. Its temporary public endpoint is:

```text
https://pub-5be4f759b3b24bff8e135c34d60fdcbe.r2.dev/
```

The `r2.dev` hostname is for validation, not the production game. Before switching the runtime,
attach a Cloudflare-managed custom hostname to the bucket and use that hostname for the manifest.
The account currently has no managed zone, so this is the only remaining infrastructure step.

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
