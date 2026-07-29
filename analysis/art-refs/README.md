# Art refs (AI mood / provenance)

Ghibli-adjacent stills and vibe boards live here per [ADR-0003](../../docs/adr-0003-ghibli-adjacent-world-presentation.md).

## Rules

- **Not runtime SoT.** Generated images do not drive meshes, textures, or geometry. OML comes from Airframe Definitions (`airframes/*.json`) and the definition-driven renderer.
- **Provenance required.** Every retained still gets a card in the airframe’s `index.json`: `date`, `model`, `promptNudges`, `epistemic: "fiction"`, and a relative `path` to the binary.
- **Binaries gitignored.** Track the index; ignore `*.png`, `*.jpg`, `*.webp`, `*.gif` under this tree (see root `.gitignore`).
- **No IP copying.** Adjacent influence only — no Studio Ghibli or Valve character/prop clones.

## Layout

| Path | Role |
| --- | --- |
| `rapier/index.json` | Provenance cards for Rapier mood refs |
| `rapier/*` (images) | Local binaries only |
| `soft-world/index.json` | Ukraine soft-world mood refs |
| `soft-world/*` (images) | Local binaries only |

## Look gate

Ukraine stills are scored against soft-world refs by `tools/look-gate/compare.mjs`
(palette + ground-band structure). See
[soft-world look gate design](../../docs/superpowers/specs/2026-07-29-soft-world-look-gate-design.md).

```bash
node tools/terrain-look/shot.mjs
node tools/look-gate/compare.mjs --shots tools/terrain-look/shots --corpus soft-world
```

Promote look into versioned content/presentation packs only through human art / engine work — never by shipping a still as the mesh source.
