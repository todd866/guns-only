# Camp Ember BF:V firebase (Build 303)

Updated: 2026-08-10

## Intent

Camp Ember must read as a Battlefield Vietnam–density firebase from the AH-1G
rear seat — not a green control disc and not a stack of same-color AABBs.

## Non-goals

- No GLB import / new asset pipeline this build
- No new sim collision unless skid sit regresses
- No canopy back into the pad eye (Build 302 clear-eye rule stays)

## Product rules

### Kill placeholders

1. Ground-war presentation must **not** draw the translucent control cylinder /
   flag beam at the Camp Ember FOB site. Control truth stays in HUD/sim.
2. Landmark `forward-operating-base` must not render as one-material box stacks.

### Authored firebase composer

Dedicated presentation for Camp Ember (`forward-operating-base`):

- Dual PSP helicopter pads (ribbed plate read, laterite/steel tone)
- Sandbag berm ring with gorge-side approach opening
- Revetted ammo / fuel cluster
- 4–6 GP tents / hooches
- Watchtower + thin radio mast (offset from eye)
- Crate / barrel clutter along berms
- Palette: olive drab, sandbag tan, PSP grey-steel, laterite dirt — never control-green

### Constraints

- Presentation-only meshes
- Mast/tower offset so cold-open nose is not a neon beam
- Keep ~120 m jungle/mist clear eye from Build 302

## Success

Owner cold-opens `/cobra-lab/`: skids on a readable Vietnam firebase, not a green
disc or debug boxes.
