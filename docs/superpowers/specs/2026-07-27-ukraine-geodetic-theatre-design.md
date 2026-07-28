# Ukraine geodetic theatre — country-scale design

Date: 2026-07-27  
Status: accepted  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[ukraine-low-level-scenery.md](../../ukraine-low-level-scenery.md),
[2026-07-26 buried launch / Ukraine theatre notes](../../2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md),
[ghibli-adjacent art direction](2026-07-27-ghibli-adjacent-art-direction-design.md),
[Korea terrain build](../../tools/terrain/README.md),
[content governance](../../content-governance.md)

## Goal

Replace the shipped **262 km synthetic Soniachne square** with a **real geographic Ukraine
theatre**: Copernicus DEM relief, accurate coastlines and national borders, large enough to feel
believably massive in the browser — while keeping every installation, unit, front, and strip
**fiction**.

Same engine must support Rapier corridor flight and medevac approaches (rewild interior + sparse
human islands per Stage C).

## Non-goals

- Photogrammetry / satellite imagery as runtime textures.
- Real bases, units, order of battle, or navigable claims about live facilities.
- MSFS-scale worldwide tiling in this pass.
- Korea look work.
- Clinic interiors / aircraft restyle.
- Completing Stage C silhouettes *before* the geodetic frame (scenery layers on after D0–D2).

## Locked decisions

| Decision | Choice |
| --- | --- |
| Geography | **A** — real Ukraine landmass (WGS84 → local metres), not synthetic relief |
| First shippable extent | **D2** — country-scale macro + Black Sea margin + eastern approaches |
| Fact/fiction | Real ground & coast/border silhouettes; **invented** strip, units, fronts, islands |
| Strip | Fictional eastern corridor / frontier — **not** a named real base |
| Sortie sense | Home on the east; inland west into rewild / no-go (aligns eastern-authority + Stage C) |
| Coast & borders | Accurate vector-derived masks / silhouettes (Natural Earth or equivalent open data) |
| DEM | Copernicus WorldDEM-30 (same provenance class as Korea), sha256-locked |
| Projection | Parameterised transverse Mercator (central meridian from region entry); do **not** hardcode UTM 52N |
| Nesting | Coarse country macro + nested detail/hero cells where low-level flight matters |
| Streaming | Range-addressable tiles (Korea atlas pattern); do not require full DEM in RAM |
| Korea rebuild | Must remain bit-identical acceptance when Ukraine builder shares maths |

## Why not the older 393 km AOI alone

The 2026-07-26 note’s ~393 km steppe AOI (33.0–38.4°E, 46.6–50.2°N) is real DEM and sized to an
early Rapier radius story, but it is **inland**: it does not deliver Black Sea coastline or a
clear national-border silhouette. Owner lock is **D2** (country-scale + coast/border), not D1 as
the shippable target. The 393 km envelope may remain a **build/debug subset** during bring-up.

## Target geographic envelope (D2)

Approximate working box (tune in plan; freeze with source lock):

- **Longitude:** ~22°E–41°E (western Ukraine through eastern approaches)
- **Latitude:** ~44°N–53°N (Black Sea / Crimea margin through northern border approaches)
- **Order of magnitude:** ~1 000–1 400 km east–west × ~800–1 000 km north–south

Exact degrees ship in `content/sources/ukraine-terrain-source-lock.json` (new), not in prose.

## Architecture

```text
Copernicus GLO-30 cells (locked SHA-256)
        │
        ▼
Ukraine terrain builder (tools/terrain/, Korea sibling)
        │  TM projection · water/coast from DEM + vectors
        │  border polylines → macro silhouette / mask layers
        ▼
Range-streamed .terrain + manifest + coarse .truth
        │
        ├─ theatre-macro (km-scale continuity, coast, border, rivers)
        ├─ nested detail cell(s) (32 m class — Soniachne successor or new eastern cell)
        └─ future hero cells (1–2 m LZ / combat) — roadmap, not this pass

Presentation
        ├─ soft-world terrain shading (Stage A) on real relief
        ├─ rewild scenery + humanPresence (Stage C) on top
        └─ medevac islands A/B as mission-placed ambient anchors
```

### Fidelity bands

| Band | Role | Spacing (order) |
| --- | --- | --- |
| Theatre macro | Horizon, coast, borders, Rapier routing, AGL continuity | 256–512 m class |
| Operational detail | Low-level Rapier / drone / medevac approach cells | ~32 m (existing contract) |
| Hero (later) | Authored LZ / combat | 1–2 m |

Macro must make **coastline and borders readable from high altitude** without depending on micro
scenery.

### Coast & borders

- **Coast / major water:** prefer Copernicus water mask + Natural Earth coastline (or peer open
  vectors) for silhouette continuity where DEM water is noisy.
- **National borders:** open cartographic vectors (Natural Earth admin-0 / equivalent). Presentation
  as soft macro cue (line / mask / slight albedo), **not** as gameplay geofence unless a later
  mission ADR says so.
- Provenance and licence text in the pack README (mirror Korea Copernicus attribution pattern).

### Fact/fiction & governance

- Epistemic label: **real terrain / fictional conflict geography**.
- No real airbase names, no real unit IDs, no “you are at \<real facility\>”.
- Strip, FARP, clinic islands, emplacements: fictional IDs only.
- Content governance / Ukraine care: no identifiable real casualties; speculative orgs labeled
  fiction (existing ADR-0003 / governance rules).

### Mission placement (eastern authority)

- Fictional strip near the **eastern** side of the envelope (frontier / home).
- Climb-out and intercept run **west** into the landmass / rewild.
- `humanPresence` falloff remains strip-relative in local metres after projection.

### Relationship to Stage C (rewild scenery)

Stage C (grammar, soft props, silhouettes, medevac islands) is **presentation on top of** this
frame. Do not block geodetic D0–D2 on finishing every Stage C mesh. After macro ships, re-tune
presence length scales to real kilometres.

Partial Stage C code in-tree may continue in parallel only where it does not assume the synthetic
262 km origin forever — prefer presence APIs that take theatre east metres.

## Success criteria

- From FL+ / high altitude: recognizable Black Sea / major water and border silhouette; landmass
  feels country-scale, not a 262 km pad.
- Rapier regional climb/intercept still has continuous AGL/collision truth.
- Low-level detail cell(s) still support soft-world flight and future medevac islands.
- Bundle streams; cold start does not download the entire country DEM.
- Korea terrain rebuild acceptance stays green.
- Manifest documents CRS, central meridian, source lock hashes, and fiction disclaimer.

## Implementation order (when planned)

1. **D0 — Source lock + projection** — Ukraine AOI degrees, Copernicus cell list, SHA locks,
   parameterised TM; Korea bit-identical rebuild gate.
2. **D1 — Macro builder bring-up** — optional smaller subset for CI; full D2 envelope locally.
3. **D2 — Coast + border layers** — vector bake into macro mask/silhouette; QA previews.
4. **D3 — Ship pack cutover** — replace synthetic Soniachne theatre product; retarget Rapier strip
   ENU; update docs (`ukraine-low-level-scenery.md`, pack README).
5. **D4 — Nest detail cell(s)** — preserve or relocate 32 m low-level cell(s) on the geodetic frame.
6. **D5 — Stage C scenery bind** — `humanPresence` + islands on real east metres; environment-lab
   stills.

## Follow-ons

- Multiple nested detail cells (coastal recovery, eastern frontier, medevac AO).
- Hero-cell feature packs with colliders.
- Political/maritime boundary gameplay rules (only with explicit ADR).
- Mid-distance vegetation impostors.

## Open constants (freeze in plan / source lock)

- Exact lon/lat envelope and central meridian.
- Macro spacing (256 vs 512 m) vs bundle size budget.
- Which open border/coast dataset version.
- Strip lat/lon (fictional site) inside the eastern approaches.
