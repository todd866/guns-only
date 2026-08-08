# Cobra Vietnam foliage cards (CC0)

Crossed-quad / alpha-tested cards for near-field jungle. These are **imported OpenGameArt
CC0 cutouts**, resized for web; not project-authored fiction.

## Atlas

| File | Contents | Notes |
| --- | --- | --- |
| `foliage-atlas.png` | 1024×512 RGBA | Left 512: palm card · Right 512: understory fern |
| `palm-card.png` | 512×512 RGBA | Source half before atlas pack |
| `understory-card.png` | ~341×512 → padded in atlas | Source half before atlas pack |

Runtime UVs: palm `u∈[0,0.5]`, understory `u∈[0.5,1]`.

## Provenance

### Palm card — `palmtree.png` → `palm-card.png`

- **Title:** Palm Plant Sprite 1024x1024
- **Authors:** qubodup (upload); textured from **Yughues** Free Plant Textures / related palm work
- **Source:** https://opengameart.org/content/palm-plant-sprite-1024x1024
- **Direct:** https://opengameart.org/sites/default/files/palmtree.png
- **License:** Creative Commons 0 (CC0) — public domain dedication
- **Acquired:** 2026-08-08; resized to 512×512 with `sips` (no content redraw)

### Understory card — `vegetation_fern_01.png` → `understory-card.png`

- **Title:** paramecij's vegetation base texture pack — `vegetation_fern_01.png`
- **Author:** paramecij (para)
- **Pack:** https://opengameart.org/content/paramecijs-vegetation-base-texture-pack
- **File node:** https://opengameart.org/node/15572
- **Direct:** https://opengameart.org/sites/default/files/vegetation_fern_01.png
- **License:** Creative Commons 0 (CC0) / public domain dedication
- **Acquired:** 2026-08-08; height-normalized to 512 px with `sips`, then padded into atlas

### Related CC0 candidates evaluated (not shipped this pass)

- Julius / Yughues — Palm Tree v2 Lowpoly Edition (OBJ + TGA diffuse) —
  https://opengameart.org/content/palm-tree-v2-lowpolyedition — kept as future mesh LOD,
  not used in the card path.
- FabinhoSC stylized tropical leaves (`bigtropicalleaf.png`, etc.) — CC0; fern cutout won
  for understory silhouette density.

## Rebuild

```bash
# From acquired originals in /tmp/guns-only-foliage-cc0/
sips -z 512 512 palmtree.png --out palm-card.png
sips -Z 512 vegetation_fern_01.png --out understory-card.png
# then composite left|right into foliage-atlas.png (1024×512)
```

Dual-sync: keep `content/packs/cobra-vietnam/environment/foliage/` identical to
`web/wwwroot/content/packs/cobra-vietnam/environment/foliage/`.
