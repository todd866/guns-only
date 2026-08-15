# Cobra Canyon — Ember Run

Date: 2026-08-07  
Status: approved for implementation  
Base: [Hold the Bridge](./2026-08-03-cobra-hold-the-bridge-design.md),
[ground war](./2026-08-03-cobra-canyon-ground-war-design.md),
owner flight `web-cobra-1786090836886-dc8wvig0` (Build 271)

## Product

One tight Hold-the-Bridge sortie that a cold player can finish without a lab sidebar:
**take off Camp Ember → follow a sky path down the river → shoot readable hostiles at the
bridge → tip/hold control → path home → land on the pad → debrief.**

Working name: **Ember Run** (same public mission title: Hold the Bridge).

### Success test

Cold open on Camp Ember → follow the floating path → see and kill hostiles that look like
targets → hold 45 s or lose with clear copy → land Ember → debrief. No debug panel required.

## Loop (~4–6 minutes)

| Act | Player cue | World |
| --- | --- | --- |
| **1 DEPART** | “Lift off Camp Ember · follow the path” | Path originates at pad; soft first gates |
| **2 INGRESS** | “Follow the gorge to the bridge” | Soft gate volumes along river-gorge route points (reuse F-22 `guidance_path` grammar) |
| **3 ENGAGE** | “Tip control friendly · Tab / hold F” | Path parks on the contested bridge site; hostiles are silhouette-readable |
| **4 HOLD / REARM** | Meter + urgency | Existing win/lose timers; bingo → Ember pad; **losing on the pad screams leave** |
| **5 RTB** | “Return to Camp Ember” | Six-gate stabilized 300° final to the centre FATO; reciprocal path remains the go-around; skids on pad → debrief |

Camp Ember is not a point target. Its operational authority is a medium helicopter FOB on a
surveyed upland bench: protected approach/departure surfaces, central FATO, separated spare-bird
revetments, maintenance, POL, ammunition and medevac/supply functions. Direct-to-centre RTB
guidance is forbidden because it can produce an unsafe reciprocal arrival.

Win/lose thresholds stay as Hold the Bridge: control ≥ +0.55 held 45 s; ≤ −0.75 for 30 s;
wreck / dry without recovery ends the sortie.

## Presentation

### Golden path

- Soft translucent gate volumes in world space (same doctrine as
  `web/wwwroot/render/scene/guidance_path.js`: probable region, not a rail; no hard edges).
- Positions come from sim-authored route / act anchors — renderer does not invent geometry.
- Active act highlights the next gate; completed legs dim.

### Shootables

- Replace brown box hostiles with **role silhouettes** (soft vehicle / hard point / infantry
  clump) that read at 400–800 ft AGL.
- Hostile color hotter than today; friendlies stay muted olive.
- Keep sim-owned tracers/smoke events; do not invent combat truth in the renderer.

### Scenery (corridor only)

- Fix canopy / foliage in the **near path + bridge site** so it does not read as crystal shards.
- Do not repaint the whole basin this build.

### Weather

- Heavier tropical haze + soft cloud shadow (profile knobs already on
  `cobra_canyon_visual_profile.js`).
- Optional light mist/rain streaks if cheap and HUD-safe.
- Weather is atmosphere only — no new weather FM authority this build.

### Objective copy

- Act-driven strip replaces the eternal “TIP CONTROL FRIENDLY · HOLD 45s”.
- Losing / pad-idle urgency (from Build 271 telem) outranks tip-friendly defaults.
- Ammo dry still wins so rearm remains possible while the bridge is falling.

## Architecture

```text
CobraMissionRuntime (+ act state)
        │ snapshots: act, path gates, ground_war, vehicle
        ▼
CobraWebBridge
        ▼
cobra-lab: guidance_path draw + objective copy + ground-war presentation + visual profile
```

- **Sim owns** act transitions (position / control / ammo / pad / outcome).
- **Browser draws** path, silhouettes, haze — never invents win/lose or kills.

## Non-goals

- New weapons (M134 only)
- Multi-site campaign / route picker as front door
- Full-map art pass
- FM rewrite
- Multiplayer ground war
- Embedding into `index.html` this pass (`/cobra-lab/` stays)

## Delivery order

1. Objective urgency + act copy (incl. pad-losing cue from `web-cobra-1786090836886-dc8wvig0`).
2. Act state in sim + bridge snapshot fields.
3. Golden path draw from route / act anchors.
4. Hostile silhouettes + color pass.
5. Corridor canopy fix + haze/weather profile.
6. RTB completion / pad debrief beat.
7. Contracts, stamp, deploy.

## Evidence to retire

Owner Build 271 sortie proved gunnery works (175 rounds, 1 kill) but lost the bridge while
idling on Camp Ember with tip-friendly copy still showing. Ember Run closes that loop and
adds the missing begin → middle → end.
