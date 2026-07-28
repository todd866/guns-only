# Ghibli-adjacent art direction — design

Date: 2026-07-27  
Status: accepted design (implements ADR-0003)  
ADR: [adr-0003-ghibli-adjacent-world-presentation.md](../../adr-0003-ghibli-adjacent-world-presentation.md)

## Goal

Replace Team Fortress 2–lineage world presentation with a Ghibli-adjacent soft world while keeping
cold, projectively true instruments — so the game teaches craft and medicine without glorifying war.

## Non-goals

- Replacing ADR-0002 product structure (immediate sorties, Ukraine theatre).
- Changing kernel physics, ballistics, or HUD projective contracts.
- Copying Studio Ghibli or Valve IP.
- Shipping unreviewed AI-generated images as runtime art SoT.
- Daily AI story server, career ladder, or medevac CRM redesign.

## Architecture

```text
AI vibe refs (fiction-labeled)     human art / shader pass
        \                               /
         -> presentation content pack -> three.js world layer
                                              |
                              HUD / capsule / medical instruments
                              (clinical, harness-gated, unchanged thesis)
```

SimulationSession remains authoritative. Presentation may not invent gameplay facts (same rule as
ukraine-low-level-scenery feature roles).

## Visual grammar

### Soft world

| Layer | Grammar |
| --- | --- |
| Terrain | Warm cultivated lowlands, shelterbelts, soft atmospheric distance; banded/painterly slopes for speed and closure |
| Settlements | Lived-in roofs, farm compounds, quiet human traces; ambient `targetable: false` until authored |
| Sky | Emotional weather; golden hour and overcast both first-class |
| Airframes | Weathered mechanical honesty; silhouette-readable; no tacticool clutter |
| Effects | Atmosphere-first smoke/dust; readable impacts; no celebratory kill porn |
| Aftermath | Prefer quiet beats over fanfare |

### Altitude detail contract

The career arc is also a rendering hierarchy. Detail increases as the aircraft descends, instead
of spreading the most expensive assets across the whole theatre:

| Flight band | What carries the image | Runtime rule |
| --- | --- | --- |
| High altitude | Landform, broad meadow/woodland values, water, haze and cloud shadow | Terrain shader and coarse geometry only |
| Low level | Shelterbelts, village spines, roads, rail, roofs and distinct woodland masses | Instanced meso scenery in the closest terrain LOD |
| Surface / LZ | Wind grass, fences, poles, yard objects, clinic and casualty context | Fixed camera-local pools sampled from terrain truth |

Micro-detail must earn its cost through near-camera parallax or interaction. Animated blades,
individual props and full canopy stands do not populate the far disc. Distant richness comes from
composition, palette, atmospheric perspective and macro terrain variation. Every visual pass is
reviewed with submitted draw/triangle counts and frame-time tails, not resident scene totals.

### Cold instruments

- Combat HUD, Rapier capsule displays, medical vitals: phosphor/amber clinical language.
- Stylization never warps funnel, AGL, LZ obstacles, or other flight-critical geometry.

### Moral thesis

Sealed cold cockpit vs warm wounded earth. Descending into the low-level cell — or punching out into
a village — is the emotional reveal. Anti-glorification is that contrast plus quiet aftermath, not
cartoon stylization of destruction.

### Audio grammar

- Cockpit sound is interior and structure-borne: dark engine body, airframe strain, pumps, latches,
  seals, ECS and electrical floor. Mechanical detail should feel handled and inhabited.
- Quiet is authored (`ma`), especially coast, transit and aftermath. Do not wallpaper it with
  generic combat music.
- Gun/hit/destroy cues stay physically informative and range-aware, never celebratory.
- Clinical alarms remain cold, sparse and legible; world/cabin texture may be warmer and imperfect.
- Future medevac sound should dramatize system state: clean fibre control, degraded autonomous
  handoff, dangerous dirty-radio return, violent reel/pickup, then acoustic shelter inside the bus.
- Influence is pacing and contrast only. Do not copy Ghibli/Hisaishi music, melodies, film Foley,
  or proprietary audio.

## AI reference pipeline

1. Generate stills with steering nudges: soft world / cold instruments; Ukraine-steppe grammar;
   no identifiable real people/units; no Ghibli character clones.
2. File a provenance card per retained set: date, model, prompt nudges, epistemic `fiction`.
3. Prefer `analysis/art-refs/` for binaries (gitignored) + a tracked `index.json` for cards.
4. Promote only through human art / engine palette-shader work into versioned content packs.
5. Cutscene use of generated stills requires a later rights/review decision.

## Migration checklist

- [x] ADR-0003 accepted and filed
- [x] Rewrite living `docs/art-direction.md`
- [x] Patch TF2-as-canon wording in Ukraine scenery and drone-war docs
- [x] First engine pass: terrain palette + atmosphere (Ukraine soft-world shader + scenery colors)
- [ ] Parallel: AI mood board for Soniachne / clinic / Rapier strip
- [ ] Aircraft and effects restyle after vibe lock
- [x] HUD harness remains green (world-only changes; terrain/scenery unit tests pass)

## Success criteria

- A still of the world reads pastoral/tragic without looking like a TF2 map.
- A screenshot of the HUD still reads as an instrument under the existing assertion contract.
- A newcomer cannot mistake generated vibe refs for shipped runtime assets without reading provenance.
- Live-war representation rules from ADR-0002 and content governance still hold.
