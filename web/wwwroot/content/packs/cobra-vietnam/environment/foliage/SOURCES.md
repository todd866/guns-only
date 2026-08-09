# Cobra Vietnam foliage cards

Crossed-quad / alpha-tested cards for near-field jungle. The active v2 atlas is project-authored
generated art shared by the WebGL and Unity presentation tracks. The original OpenGameArt CC0
cutouts remain in the pack as documented legacy sources but are no longer loaded at runtime.

## Atlas

| File | Contents | Notes |
| --- | --- | --- |
| `foliage-atlas-painted-v2.png` | 1024×1024 RGBA | Active 2×2 palm · hardwood · bamboo/banana · fern/scrub atlas |
| `foliage-atlas.png` | 1024×512 RGBA | Left 512: palm card · Right 512: understory fern |
| `palm-card.png` | 512×512 RGBA | Source half before atlas pack |
| `understory-card.png` | ~341×512 → padded in atlas | Source half before atlas pack |

Runtime v2 UVs are recorded in `cobra-canyon-visual-contract.v1.json`.

## Painted v2 atlas

- **Method:** OpenAI built-in image generation followed by local chroma-key removal, despill,
  one-pixel matte contraction, resize to 1024×1024, and 12-pixel transparent-RGB dilation for
  mip-safe alpha-tested edges. Runtime cutoff is 0.38.
- **Generated:** 2026-08-08.
- **Human direction:** Guns Only Cobra Canyon tropical foliage readability and cross-renderer
  reuse.
- **Source record:** `foliage-art-manifest.v2.json` contains the full production prompt and
  quadrant contract.
- **Rights:** project-authored renderer asset; covered by the repository MIT licence.
- **Runtime:** `foliage-atlas-painted-v2.png`; no generated image is used as simulation,
  collision, or target authority.

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

## Legacy CC0 rebuild

```bash
# From acquired originals in /tmp/guns-only-foliage-cc0/
sips -z 512 512 palmtree.png --out palm-card.png
sips -Z 512 vegetation_fern_01.png --out understory-card.png
# then composite left|right into foliage-atlas.png (1024×512)
```

Dual-sync: keep `content/packs/cobra-vietnam/environment/foliage/` identical to
`web/wwwroot/content/packs/cobra-vietnam/environment/foliage/`.
