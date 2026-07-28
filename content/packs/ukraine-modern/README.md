# Ukraine 2030s — geodetic jet-range theatre

Real Copernicus DEM + water mask over a ~393 km class AOI sized for Rapier range
(`33.0–38.4°E`, `46.6–50.2°N`). **Strip, units, and fronts are fictional.** Not for
navigation or claims about real facilities.

## Shipped product (viewable)

```text
environment/terrain-atlas/rapier-range.atlas.manifest.json
environment/terrain-atlas/pages/…
```

- Schema v2 range-streamed atlas (`terrain.ukraine.rapier-range.atlas.v1`)
- Reference origin (fictional eastern strip): `38.0°E`, `48.5°N`
- Central meridian: `35.7°E` (parameterised TM; not UTM 52N)
- Scenery profile: `ukraine-modern`
- ~16 pages / ~400 MiB of height records (streamed; working set is far smaller)

Legacy synthetic Soniachne (`environment/terrain/soniachne-steppe.*`) remains on disk for
comparison but is no longer the production Rapier / lab default.

## Rebuild (requires locked Copernicus cache)

```sh
python3 tools/terrain/lock_ukraine_atlas_sources.py \
  --region rapier-range \
  --cache .cache/copernicus \
  --output content/sources/ukraine-terrain-source-lock.json

python3 tools/terrain/build_korea_atlas.py \
  --lock content/sources/ukraine-terrain-source-lock.json \
  --region rapier-range \
  --cache .cache/copernicus \
  --output content/packs/ukraine-modern/environment/terrain-atlas

rsync -a --delete \
  content/packs/ukraine-modern/environment/terrain-atlas/ \
  web/wwwroot/content/packs/ukraine-modern/environment/terrain-atlas/
```

Country-scale D2 envelope (full UA + Black Sea margin + eastern approaches) is declared in
`content/sources/ukraine-terrain-source-lock.json` as `ukraine-d2`; expand acquisition with
`--region canonical` when ready. Coast/border vector silhouettes are the next silhouette pass
on top of this DEM.

## Licence

Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The
organisations in charge of the Copernicus programme by law or by delegation do not incur any
liability for any use of the Copernicus WorldDEM-30.
