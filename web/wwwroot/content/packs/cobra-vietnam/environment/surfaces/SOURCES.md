# Cobra Vietnam generated surface materials

## Limestone v1

Generated on 10 September 2026 (Australia/Sydney) with the built-in OpenAI ImageGen tool.
The tool did not identify its backend model; that metadata remains unknown. Epistemic label:
`fiction`. This is fictional presentation material under the scope documented in
[ADR-0004](../../../../../docs/adr-0004-generated-presentation-assets.md); runtime acceptance
is tracked separately from packaging.

The request was a reusable grey tropical limestone surface with muted olive mineral stains,
broad stone forms, irregular fissures and fine pitting. The complete verbatim prompt and
generation/encoding record are retained in
`tools/assets/generators/cobra-surfaces/sources/limestone-generated-v1.provenance.json`.
Generation used text alone, with no reference-image input.

| File | Dimensions / encoding | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Retained master: `tools/assets/generators/cobra-surfaces/sources/limestone-generated-v1.png` | 1254×1254 RGB PNG, no alpha | 3530859 | `8ce8cf6586defccd17116402ee1049feb7bcc2ea800aa50f00856799fb134427` |
| Runtime: `limestone-generated-v1.webp` | 1024×1024 RGB WebP, no alpha | 344424 | `568a68ecd66d0730a59f43e58f706f62cac705e9f7308eeebf996e703f0eec04` |

The master is an exact byte copy of the generated output. Packaging performs resizing and
WebP encoding only, with no creative pixel edits or edge repair. The source was requested to
be seamless, but its opposing edges do not match. **Use mirrored repetition; do not describe
the source itself as seamless.** Source left/right and top/bottom mean absolute RGB edge
differences measure 19.421 and 23.346 channel levels out of 255. Mirroring removes the hard
edge mismatch but can reveal symmetric repeated features, which require review in the game.

This is sRGB colour artwork, not a calibrated reflectance map. Its illustrated fissure
shading is part of the image. Any shader-derived luminance relief is an artistic height proxy,
not measured or separately generated height data. The prompt's 18 m extent is an artistic
scale request, not geological evidence. Material appearance must not alter the authoritative
terrain, collision, physics, world positions or gameplay visibility.

## Treetop canopy v1

Generated on 10 September 2026 with the built-in OpenAI ImageGen tool, using text alone and
no image references. The tool did not report its backend model. The square image shows dense
small tropical broadleaf clusters, muted olive/forest/sage leaf faces and sparse fine twigs.
It is an opaque color surface for the separate crown meshes, not a leaf-cutout opacity atlas.
The exact prompt, original tool output path and full metadata are retained in
`tools/assets/generators/cobra-surfaces/sources/canopy-generated-v1.provenance.json`.

| File | Dimensions / encoding | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Retained master: `tools/assets/generators/cobra-surfaces/sources/canopy-generated-v1.png` | 1254×1254 RGB PNG, no alpha | 3482348 | `6d753ec9d9237a572ccf11baac61360f6f510c47865c71ccd36a9f64aa92ebe1` |
| Runtime: `canopy-generated-v1.webp` | 1024×1024 RGB WebP, no alpha | 362538 | `31804fe8aa3b1d0f0c01e68af3cefa6f29dea0b5783a655155eafe3d30fa0e21` |

The master is an exact copy of the generator output. Native review found no sky, text,
checkerboard or border. Its opposing edges are not seamless: mean RGB differences measure
27.549 left/right and 35.234 top/bottom channel levels out of 255. Mirrored repetition joins
matching edge pixels, though symmetrical motifs remain a runtime review concern. The prompt's
12 m coverage is an artistic scale request. This fictional color artwork supplies no botanical,
height, placement or collision authority. Leaf shading is illustrated, not calibrated reflectance.

The canopy uses the same bounded 1024² allocation and sRGB/mipmap/anisotropy-4 sampling contract
as limestone, costing at most 5.334 MiB assuming RGBA GPU storage. Together the two textures
cost at most approximately 10.668 MiB with complete mip chains. Each loads independently;
failure of either asset preserves the other asset and the missing asset's material fallback.

## Rebuild and validation

From the repository root:

```sh
node tools/assets/generators/cobra-surfaces/encode.mjs
node tools/assets/generators/cobra-surfaces/encode.mjs --check
```

The reviewed encoder is `cwebp 1.6.0` (`libsharpyuv 0.4.2`), with
`-resize 1024 1024 -m 6 -sharp_yuv`, quality 86 for limestone and 84 for canopy.
The check re-encodes both retained masters and compares canonical and staged runtime files
byte-for-byte. These checks passed for the hashes above.
One 1024² texture with a complete mip chain costs at most approximately 5.334 MiB assuming
RGBA GPU storage, and adds no geometry. Actual shader sampling and frame cost need runtime QA.

Keep this folder identical to
`web/wwwroot/content/packs/cobra-vietnam/environment/surfaces/`.
The local manifest records each candidate, resolution, hash, encoding limitations and fallback.

## Rights and provenance

The source contains no marks, text, personal likenesses or identified locations. No source
photograph or third-party image entered the generation. The project-generated output is
distributed under the repository MIT notice, with no assertion of exclusive copyright in
AI-generated material. See `licenses.json` for the retained rights record.
