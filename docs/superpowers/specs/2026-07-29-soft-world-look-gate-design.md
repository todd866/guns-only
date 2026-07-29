# Soft-world look gate — design

Date: 2026-07-29  
Status: accepted (owner: go; option 2 — structure + palette)  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[art direction](../../art-direction.md),
[art-refs README](../../../analysis/art-refs/README.md),
[terrain-look](../../../tools/terrain-look/shot.mjs),
[ukraine hero gate](../../../tools/perf/ukraine_hero_gate.mjs)

## Goal

Give Ukraine soft-world presentation a **failing look harness**: captured stills are compared to a
fiction-tagged **Ghibli-adjacent corpus** (palette + structure energy), not to “strings exist in
`app.js`.” The product target is **good Ukraine graphics** (painterly steppe, readable near field,
warm atmosphere) — not SNES flat disks and not Korea-blue leftovers.

Pilot complaints about “terrible FPS + SNES look” are often confounded by **graceful degradation**
(frame governor shedding view distance / scenery / ambient budget while the machine is under
heavy load). The gate must therefore **record and report** quality tier + governor level so a
shed frame is never scored as the intended desktop Ukraine look.

## Non-goals

- Studio Ghibli / Valve frame corpora (IP). Adjacent influence only.
- CLIP / embedding models in v1
- Pixel-perfect golden PNG diffs of full sorties
- Shipping art-ref binaries as runtime mesh/texture SoT
- Replacing `ukraine_hero_gate` FPS measurement (complementary)
- Claiming shed tiers look good

## Locked decisions

| Decision | Choice |
| --- | --- |
| Compare mode | **Option 2:** palette + structure energy |
| Corpus | `analysis/art-refs/soft-world/` (+ later `rapier/` for launch peaks) |
| Epistemic | Indexed cards only; `epistemic: "fiction"`; binaries gitignored |
| Capture hosts | `tools/terrain-look/shot.mjs` first; punch-out / hero-moment stills next |
| Theatre | **Ukraine** jet-range / soft-world path only for v1 |
| Degrade confound | Every capture + report records `qualityTier`, governor level/status, DPR, canvas size |
| Gate policy | **Warn-first** with checked-in thresholds; flip to fail when baselines are honest |
| CI | Not SwiftShader smoke; local / optional job like hero gate |

## Architecture

```text
art-refs/soft-world/index.json ──► corpus features (cached JSON)
terrain-look / QA PNGs ──────────► capture features + provenance
                                         │
                                         ▼
                              tools/look-gate/compare.mjs
                                         │
                    palette Δ + structure Δ vs mapped refs
                                         │
                              report.json (+ optional HTML)
                         warn or fail per thresholds.json
```

### Feature extract (per image, no ML)

| Family | Metrics | Failure mode caught |
| --- | --- | --- |
| Palette | Warm/cool chroma ratio; mean Lab in lower/upper bands; saturation histogram distance to refs | Korea-blue sky, cream-soup wash, dead grey |
| Structure | Laplacian variance / edge energy; mid-band spatial variance in **lower half** (ground) | Empty SNES disk, missing grass/shelterbelt energy |
| Provenance | `qualityTier`, governor announce/level if available, `devicePixelRatio`, canvas CSS/backing size, terrain id, soft-world on | Mis-scoring a shed mobile frame as “desktop look” |

Sky-only bloom must not fake-pass structure: structure metrics weight the **ground band** (bottom ~55% of frame) higher than the sky band.

### Corpus mapping

| Capture id | Default ref ids (from index) |
| --- | --- |
| `steppe-low` | `no-mans-land-mood-v1` (+ future meadow refs) |
| `corridor-mid` | `no-mans-land-mood-v1` |
| `high-oblique` | `no-mans-land-mood-v1` (palette-weighted; structure threshold looser) |
| Hero-moment stills (later) | `rapier/` cards when present |

Missing listed binary: **fail closed** unless `GUNS_LOOK_GATE_ALLOW_MISSING=1` (dev machines without downloaded refs).

### Thresholds

`tools/look-gate/thresholds.json`:

- Per capture class: max palette distance, max structure distance (and optional min absolute ground energy)
- `high-oblique` may use looser structure (macro landform, not meadow)
- Initial check-in from current terrain-look stills + corpus; gate runs **warn** until owners flip `mode: "fail"`

### Provenance contract (anti-shed false fail)

Captures used for scoring **should** include a sidecar or `views.json` fields:

```json
{
  "qualityTier": "desktop",
  "governorLevel": 0,
  "softWorld": true,
  "terrainId": "terrain.ukraine.rapier-range.atlas.v1"
}
```

If `governorLevel > 0` or tier is `mobile` while the threshold profile expects `desktop`, the report
marks the row **`degradedCapture`** and either skips fail or applies the mobile profile — never
silently scores shed scenery as the Ukraine desktop target.

## CLI

```bash
# After terrain-look
node tools/terrain-look/shot.mjs
node tools/look-gate/compare.mjs \
  --shots tools/terrain-look/shots \
  --corpus soft-world \
  --mode warn   # or fail
```

Exit codes: `0` pass/warn-only; `1` fail (when mode=fail or missing corpus without allow); `2` usage.

## Success

- A deliberately washed / flat synthetic PNG fails structure or palette against soft-world refs
- Current honest Ukraine desktop stills pass (or warn within known gaps) with provenance attached
- A governor-shed capture is labeled degraded, not “Ukraine looks like SNES by design”
- Docs state clearly: **good Ukraine graphics** is the bar; soft-world ≠ permission to ship SNES

## Out of scope follow-ons

CLIP embeddings; automatic ref generation; wiring into every Playwright smoke; raising terrain LOD
budgets (product work, not this harness).
