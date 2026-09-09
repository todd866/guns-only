# Cobra Vietnam foliage cards

## Generated atlas v2 — current runtime source

Created 2026-09-09 with the built-in OpenAI ImageGen tool. The tool did not report a
backend model name; it has not been guessed. Epistemic label: `fiction`.

The owner requested new generated game assets in this task. This texture is accepted under
[ADR-0004](../../../../../docs/adr-0004-generated-presentation-assets.md) as presentation-only
material art. It supplies leaf colour and coverage to existing bounded jungle cards; plant
placement, dimensions, collision, targets and weather remain owned by the existing game.
The original CC0 atlas is retained below with its unchanged source files and attribution.

The first image and one transparency correction contained an opaque painted checkerboard and
were rejected for runtime use. A further ImageGen edit supplied a uniform near-black RGB
backing. This is **RGB with encoded coverage, not RGBA transparency**. The original CC0 atlas
was passed to ImageGen as the layout/silhouette input; no shell poster, film frame or factual
war imagery was used. Its CC0 provenance and redistribution permissions remain documented below.

- Exact accepted source: `tools/assets/generators/cobra-foliage/sources/foliage-atlas-rgb-coverage-v2.png`, 1774×887 RGB.
- Source SHA-256: `6751f5dcf9ddf42a93887cb183a7fe36972b09eae1bdf2f9cfb25df68ba3ac8c`.
- Complete exact prompts, every image input and output hash, model-identity limitation and
  rejection record: `tools/assets/generators/cobra-foliage/sources/foliage-atlas-rgb-coverage-v2.provenance.json`.
- Runtime file: `foliage-atlas-generated-v2.png`, 1024×512 RGB, 546554 bytes.
- Runtime SHA-256: `e16bb50cb7a63083f0ab6a4af537631a31a86ce745ff82d00eaacd1bf44896c8`.
- Packaging only: `sips -z 512 1024 tools/assets/generators/cobra-foliage/sources/foliage-atlas-rgb-coverage-v2.png --out content/packs/cobra-vietnam/environment/foliage/foliage-atlas-generated-v2.png`.

### Runtime interpretation and review

Only this versioned source receives `black-matte-v1` in the loader. The material samples the
existing map once, using the source's clear gap at u=0.52 to map the two existing geometry UV
halves without clipping the left clump's outermost tip. Coverage is a smooth threshold of the
maximum **linear** RGB component from 0.002 to 0.018. The narrow edge transition is
unpremultiplied before the existing alpha test; near-black backing cannot make opaque cards.
Colour, directional-shadow depth and point-shadow distance materials share this interpretation.
Existing CC0 alpha textures and synthetic fallbacks do not receive the shader variant.
Runtime screenshot review found the old atlas's brightness lift made the generated midtones too
lime. Generated cards therefore use a neutral material tint and mix 30% linear luminance into
their sampled colour. This correction runs after coverage is measured and leaves the silhouette,
shadow coverage, original RGBA material tint, mipmaps and texture bytes unchanged.

The reviewed source keeps broad connected leaf masses and a distinct fern, without labels,
people, logos or ground scenery. Pure background borders measure at most 1/255 per RGB channel.
The source is project-generated with an explicitly permitted CC0 layout input. No unsupported
ownership claim is made; the project asset is distributed under its existing MIT notice,
with the input provenance retained in `licenses.json`. The local `asset-manifest.json` pins
runtime bytes, dimensions, encoding and rights evidence. The GPU allocation remains the existing
1024×512 map with mipmaps (less than 2.667 MiB); no geometry or draw submissions are added.

# Retained CC0 atlas v1

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
