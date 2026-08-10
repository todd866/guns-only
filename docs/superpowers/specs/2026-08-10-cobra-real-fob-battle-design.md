# Real Camp Ember FOB + airborne path + Iron Bell fight

Date: 2026-08-10  
Status: approved for implementation (owner: “build me a real FOB… airborne soft gates… battle I can shoot”)  
Base: Build 300 Depart cold-open (`cceadf45`)

## Product

The Depart picture must read as a **Vietnam-era land FOB**, not a deck in the river. The path must be **soft volumes in the air** you fly through. The bridge must be a **fight with destroyable hostiles**, not empty gorge chrome.

## Phase A — Real Camp Ember

1. Move Camp Ember onto a **land spur** west of the river corridor (not `TerrainSurfaceKind.Water`).
2. Spawn skids on that pad; yaw toward the gorge join.
3. Presentation: PSP/concrete H-pad, sandbag berms, revetment, fuel blivet, thin mast/windsock — **no** giant green mass, orange cone, or riverboat deck in the eye.
4. Keep friendlies-only on the pad; no nose hostile at open.

**Coords (measured land, ~202 m MSL, slope &lt; 0.1):** East `-6775`, North `-6200`. River join stays near `-6500, -6200` as the first down-gorge gate.

## Phase B — Airborne soft gates

1. Gate altitude = corridor `PathAltitudeM + TargetAglM` (nap-of-earth), not floor MSL.
2. Soft warm volumes ahead of the aircraft; visual half stays a fly-through cue (~20–28 m), not a gorge UFO.
3. Copy still says follow the soft path; the path must be findable after lift-off.

Do **not** retune shared `guidance_path.js` defaults for F-22 — override only in cobra-lab / `cobra_ember_path.js`.

## Phase C — Iron Bell battle you can shoot

1. Seed denser **hostile** soft vehicles + infantry + at least one **hostile hard-point** on Iron Bell (and keep waves).
2. Presentation: hotter marks, longer wreck retention, kill flash/smoke that reads at nap AGL.
3. Gunnery seam still deferred until Ingress; bridge fight is the main destroyable set-piece.

## Dual authority

`CobraCanyonDefinition.Create()` and both `content/.../cobra-canyon.world.json` + `web/wwwroot/content/...` stay in sync. All three routes that name Camp Ember move with the landmark.

## Non-goals

- Full DCS pad procedures / startup
- Hard hoop rails instead of soft gates
- Destroying the bridge mesh itself (still a collision hazard)
- Retuning F-22 recovery guidance defaults
