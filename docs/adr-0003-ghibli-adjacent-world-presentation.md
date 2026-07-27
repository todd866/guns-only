# ADR-0003: Ghibli-adjacent world presentation

Status: Accepted — 2026-07-27

Supersedes the Team Fortress 2–lineage look and the “cartoon kills as horror” moral thesis in
[`art-direction.md`](art-direction.md), the art-direction section of
[`ukraine-low-level-scenery.md`](ukraine-low-level-scenery.md), and TF2 presentation notes in
[`drone-war-design.md`](drone-war-design.md).

Does **not** supersede ADR-0001, ADR-0002 (Ukraine / immediate-sortie product contract), the
deterministic kernel, or the projective HUD honesty contract.

## Context

TF2-lineage illustrative rendering was chosen for low-level readability and for a 2030s thesis that
tidy, cartoony kills are themselves the horror (interface-manufactured moral distance). The product
has since moved toward a 2030s Ukraine theatre, medevac and clinic beats, and an explicit
anti-glorification educational stance.

A soft, painterly world paired with cold clinical instruments carries that stance more cleanly:
beauty and human presence outside the canopy; sealed phosphor machines inside. Studio Ghibli’s
aviation paradox — awe for craft without romance for war — is the tone target. This is **adjacent**
influence (light, landscape, pace, quiet aftermath), not a pastiche of specific films or characters.

## Decision

1. **Canonical 2030s world look is Ghibli-adjacent.** Painterly light, lived-in landscape, soft
   atmosphere, weathered mechanical honesty, readable silhouettes. Quiet aftermath (`ma`) and
   human-scale detail matter more than celebratory combat VFX.
2. **Instruments stay cold.** Combat HUD, capsule/SVS displays, and medical telemetry remain
   clinical (phosphor/amber language) and projectively true. World stylization never warps funnel
   geometry, AGL, LZ obstacle truth, or other flight-critical cues.
3. **Anti-glorification is contrast + aftermath**, not cartoon kill stylization. Kill presentation
   is sparse and factual (symbology and telemetry), not fireworks.
4. **AI image generation is a reference/vibe pipeline.** Mood boards, palette locks, lighting
   studies, and briefing stills may be generated to lock the look. Generated images are **not**
   the runtime mesh/texture source of truth unless a later ADR says so. Retained refs carry
   provenance (prompt nudges, model, date) and an epistemic `fiction` label.
5. **No IP copying.** Do not reproduce Studio Ghibli characters, props, or trademarked designs.
   Do not copy Valve TF2 characters, textures, or props either (that prohibition remains).
6. **Presentation-layer only.** Art ships in versioned content/presentation packs. The simulation
   kernel remains untouched.

## Consequences

**Kept**
- Silhouette-first aircraft and obstacle readability (safety and guns-only ID).
- Altitude-aware scenery density for performance.
- HUD assertion harness and projective truth.
- Live-war care: no identifiable real casualties; speculative orgs/platforms labeled fiction.

**Changed**
- Terrain and atmosphere palettes move from TF2 ramps/rim language to warmer painterly Ukraine-steppe
  grammar (fields, shelterbelts, soft distance).
- Moral thesis: sealed cold cockpit vs warm wounded earth; descent (or punch-out into a village) is
  the emotional reveal.
- “Cartoon enemy” roadmap language becomes soft-world / cold-instrument language.

**Deferred**
- Shipping AI-generated stills as cutscene product (needs rights/review gate).
- Full aircraft/effects restyle after terrain/atmosphere vibe lock.
- Korea-era historical realism packs (separate era decision; not rewritten by this ADR).

## Migration

1. This ADR is accepted; [`art-direction.md`](art-direction.md) becomes the living look bible under it.
2. Patch Ukraine scenery and drone-war docs that still cite TF2 as current canon.
3. Engine order: terrain palette + atmosphere → aircraft/effects → clinic/briefing stills via AI refs.
4. World-only visual changes; HUD harness stays the regression gate for instruments.

## Open questions

- Exact palette tokens and shader technique (gradient-mapped diffuse vs softer PBR break) for the
  first terrain pass.
- Where AI refs live on disk (`analysis/art-refs/` vs a content pack) and what is gitignored.
- Whether future cutscenes promote generated stills under a separate production ADR.
