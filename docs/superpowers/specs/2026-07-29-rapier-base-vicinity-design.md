# Rapier installation vicinity kit

Date: 2026-07-29  
Status: accepted (owner: go; Approach 1)  
Related: [launch gallery](./2026-07-29-rapier-launch-gallery-ghibli-wwiii-design.md),
[nav fabric scenery bind](./2026-07-29-shared-geography-nav-fabric-design.md),
[ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md)

## Goal

Make the ~300 m around the Rapier eastern dispersed strip read as a **lived-in defensive EM
installation** — spoil, battered revetments, gravel access, soft berm landscape — without implying
a targetable airfield or promoting ambient props to collision/targets.

## Non-goals

- Mesh Place / `scenery_anchor` content pack (follow-on; this kit may later rebrand as that bind)
- Kernel HomePlate / collision / target lists
- 4 km hero cell or village campus
- New catshot FX
- Free Fix scenery seeding

## Locked decisions

| Decision | Choice |
| --- | --- |
| Approach | **Installation vicinity kit** inside `createRapierDispersedStrip` |
| Role | Ambient presentation only (`userData` may mark `ambientRole: "vicinity"`) |
| Radius | Soft richness within ~300 m of strip centreline / gallery |
| Tone | ADR-0003: earth, weathered concrete, quiet spoil — no orange “value blocks”, no IP |
| Edge lamps | Keep sparse strip edge markers (readability) |
| Orange cubes | **Remove** training-orange blocks |

## Architecture

```text
createRapierDispersedStrip()
  … gallery / ramp / FX (unchanged contracts) …
  STRIP_VICINITY
    revetments (earth + battered concrete lips)
    spoil piles
    gravel access track
    soft shoulder berms
  RAPIER_STRIP_EDGE_LAMPS (retained)
```

## Structure (v1)

1. **Blast revetments** — low U / staggered wall pairs outside the shoulder, recovery end and
   mid-field; earth body + thin concrete crest. Not hangars.
2. **Spoil piles** — soft irregular mounds near gallery berms and a few shoulder dumps (cut-and-cover
   fiction).
3. **Access track** — narrow gravel ribbon from gallery berm toward strip shoulder (service path,
   not a taxiway system).
4. **Soft berm landscape** — low earth shoulders paralleling the strip beyond the hard shoulder,
   tying gallery mound into the steppe.

## Success

- High abeam / whole-site view no longer reads as “empty concrete + orange cubes”
- Still clearly **not** a full airfield (no parallel taxiways, no aprons of parked fighters)
- `rapier_presentation.test.mjs` stroke / handoff / rib / edge-lamp contracts still pass
- Named `STRIP_VICINITY` present for shots and future Place migration
- Build stamp +1 on wwwroot ship (Build **186**)

## Out of scope follow-ons

True Place footprint pack; fence/gate detail pass; support-vehicle silhouettes; Mesh ND place icon art.
