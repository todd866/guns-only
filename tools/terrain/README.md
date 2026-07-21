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

Required notice for these modified products:

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
> 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

The organisations in charge of the Copernicus programme by law or by delegation do not incur any
liability for any use of the Copernicus WorldDEM-30.
