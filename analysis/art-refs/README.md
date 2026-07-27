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

Promote look into versioned content/presentation packs only through human art / engine work — never by shipping a still as the mesh source.
