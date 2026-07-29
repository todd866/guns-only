# Mesh ND redesign — map-first nav + recovery procedures

Date: 2026-07-29  
Status: draft pending owner review (brainstormed with owner)  
Related: [Routing Mesh canon](../../nav-fabric-canon.md),
[shared geography](2026-07-29-shared-geography-nav-fabric-design.md),
[circuits FD boxes](2026-07-27-circuits-fd-boxes-design.md),
[circuits SA boxes](2026-07-27-circuits-sa-boxes-design.md),
[hud limits panel](2026-07-27-hud-limits-panel-design.md),
[ANCA2040](2026-07-29-anca2040-design.md)

## Goal

Replace the legacy TF-console-clone `#nav-console` body with a **map-first Mesh navigation
display (ND)** that supports pan/zoom, ActiveDest drag, follow/free camera, ordered Tour planning,
and **recovery procedure select** (overhead / downwind rejoin / straight-in) with HUD flythrough
boxes and Rapier energy gates — whenever HomePlate is known.

## Non-goals

- Scenery richness on Place footprints (separate follow-on)
- Published Hard Route airway nets beyond the three recovery procedures
- Replacing ANCA Navigate (still view-only SA over Mesh/fuel truth)
- Making the ND a second HUD for combat symbology
- Jeppesen cosplay or real civil plate geometry

## Locked decisions

| Decision | Choice |
| --- | --- |
| Shell | **Replace `#nav-console` in place** (same corner, N key); body is ND, not a TF readout grid |
| Interaction | Pan, zoom, click Place/Free Fix, **drag ActiveDest**, ownship-follow vs free-pan, **ordered Tour** |
| Ship shape | **One redesign slice** (not phased interaction-then-tour) |
| Procedures | Anytime HomePlate known: **OVERHEAD / DOWNWIND REJOIN / STRAIGHT-IN** |
| Architecture | Kernel **`RecoveryProcedure` director** owns procedure + gate energy; ND/HUD present it |
| Boxes | Reuse/extend existing Circuits flythrough + `rapier_gate_*` energy machinery |
| Cruft | Strip handoff/relief/thermal/gross/thrust/contact rows from nav; Mesh solution strip only |
| Straight-in / rejoin | Real recovery procedures with energy targets (not Intercept marshal cosplay only) |

## Architecture

```text
Mesh (ActiveDest / Tour / Free Fix / HomePlate)
        \
         +--> Mesh ND (map-first UI in #nav-console)
        /
RecoveryProcedure director
  Overhead | DownwindRejoin | StraightIn | None
        |
        +--> gate volumes + energy/config targets (snapshot)
        |
        +--> HUD flythrough boxes (existing projective path, generalized)
        |
        +--> ND procedure overlay (polyline + gate pips)
```

ANCA Navigate continues to mirror fuel/home/dest facts; it does not host the procedure picker.

---

## 1. ND chrome (shell)

### Layout (open `#nav-console`)

Top → bottom inside `.tf-body`:

1. **Toolbar** (one row): Follow | Free · procedure chips · Clear dest · (optional) Add tour stop hint  
2. **Map** (dominant — ≥60% of open panel height; taller than today’s 160 px stub)  
3. **Solution strip** (compact, not a 4-band TF grid):

| Slot | Content |
| --- | --- |
| DEST | ActiveDest name / FIX / tour “n/N · name” |
| BRG / RNG / ETA | Mesh dest solution (honesty-gated) |
| FUEL ABOARD | `fuel_lb` — always when known |
| TRIAD | NM/MIN · LB/MIN · LB/NM |
| RESERVE | margin via dest→HomePlate (or direct home if dest is home) |
| PROC | Active recovery procedure short label + next gate energy cue |

### Kill list (remove from nav)

- Closure-home wording that assumes dest≡home without Mesh  
- Gross weight, thrust, skin/CMC thermal block  
- Combat handoff / relief kills  
- Contact range / ETI  
- Any Circuits “BOX n/4” essay that belongs on the HUD gate label instead  

Circuits leg may appear as a quiet PROC/gate cue, not a wide destination rewrite that hides Mesh dest.

### Persistence

Keep console open/position behavior if already draggable (circuits SA spec); map follow/free and last procedure are session-local unless already persisted — v1: **no new localStorage** beyond existing console drag prefs.

---

## 2. Map interaction + Tour

### Camera

| Mode | Behaviour |
| --- | --- |
| **Follow** | Centre on ownship; heading-up or north-up (v1: **north-up**); pan disabled while follow locked |
| **Free** | Pan (drag background), zoom (wheel / pinch); ownship may leave centre |

Toggle on toolbar. Starting mode: **Follow**. Switching to Free keeps current centre; switching to Follow recentres.

### Zoom / pan

- Zoom range ~**15 NM** to ~**400 NM** across map width (theatre planning).  
- Pan only in Free.  
- Double-click (or toolbar) **Recenter / Follow**.

### Selection

| Gesture | Open Segment / free-fly catalog | Mission-gated |
| --- | --- | --- |
| Click selectable Place | Set ActiveDest | Set ActiveDest if listed |
| Click empty | Create Free Fix ActiveDest | No-op |
| Click landmark | No-op | No-op |
| Drag ActiveDest pip | Move Free Fix, or convert Place dest to Free Fix at drop | Same if selectable; else no-op |
| Drag background | Pan if Free | Pan if Free |

### Tour

- **Add stop:** with Tour armed (toolbar “TOUR+” or shift-click), each Place/Free Fix appends to ordered list; ActiveDest = next incomplete stop.  
- **Clear tour:** toolbar; ActiveDest returns to HomePlate.  
- **ND draw:** thin polyline Home→stops; numbered pips.  
- **Fuel:** solution strip still projects **reserve on return to HomePlate after remaining tour** (polyline at current LB/NM), per shared geography spec.  
- Tour does **not** auto-select a RecoveryProcedure; pilot picks OVERHEAD / etc. when ready to recover.

---

## 3. RecoveryProcedure + energy / boxes

### Kernel type

```text
enum RecoveryProcedureKind { None = 0, Overhead = 1, DownwindRejoin = 2, StraightIn = 3 }
```

`RecoveryProcedureDirector` (name flexible):

- `SetProcedure(kind)` — allowed when HomePlate known; else reject  
- Publishes: active kind, ordered gate list (east/north/up, half-size, target KTAS, config dirty/clean), active gate index, in-volume / energy-ok / config-ok (extend existing Rapier gate fields or parallel `recovery_gate_*` if Circuits fields must stay Circuits-only)  
- **Overhead:** map existing Circuits overhead legs/gates when `PatternOnly` / Circuits geometry exists; on Intercept with HomePlate, author a reduced overhead set aimed at the strip (may reuse Circuits gate builder with strip frame)  
- **Downwind rejoin:** gates for join downwind → base → short final → wire (energy shed schedule Rapier-appropriate)  
- **Straight-in:** final-ish corridor gates to threshold/wire with higher energy discipline (no break)  
- **None:** no procedure overlay; HUD boxes follow mission-default Circuits path only when Circuits already armed

Selecting a procedure **does not clear** ActiveDest/Tour. Teaching line: procedure is *how you recover HomePlate*; Tour is *where you sightsee first*.

### HUD

- Generalize `circuitGatePresentation` to **recovery gate presentation** driven by active procedure (Circuits pattern-only remains a valid source when procedure is Overhead on Circuits).  
- Flythrough square + energy/config accents stay projective and instrument-true.  
- When procedure is None and not Circuits, no new boxes (don’t invent Intercept combat boxes).

### ND overlay

- Draw procedure path + gate rectangles/pips; highlight active gate.  
- Procedure chips on toolbar set kernel procedure (bridge export).  
- Disabled chips when HomePlate unknown.

### Energy teaching (Rapier)

Each gate carries target KTAS (+ dirty/clean config). `energy_ok` compares present speed (and existing gate logic) to target band. Straight-in and downwind rejoin must not silently reuse INITIAL 300 KT targets on short final — schedules are procedure-specific tables in the director (data, not magic numbers in JS).

---

## 4. Snapshot / bridge

**Bridge (illustrative):**

- Existing Mesh: `SetMeshActivePlace`, `SetMeshFreeFix`, `ClearMeshActiveDest`  
- New: `SetRecoveryProcedure(int kind)`, `SetMeshTourJson` / `ClearMeshTour` / `MeshTourAppend(...)` as needed for ordered stops  
- Prefer kernel-owned tour list over browser-only tour so fuel honesty holds

**Snapshot:** procedure kind + gate fields + tour stop count/ids; ND reads Mesh + procedure overlays from state.

Layout/schema bumps follow the usual ritual when hot slots grow.

---

## 5. Error handling

| Case | Behaviour |
| --- | --- |
| Procedure select, no HomePlate | Reject; chips disabled |
| Drag Place in mission-gated without listing | No-op |
| Free Fix outside clamp | Reject drop |
| Tour empty | ActiveDest HomePlate |
| Procedure None on Circuits | Keep today’s Circuits boxes |
| Missing fuel_lb | Aboard shows unknown; no invented triad |

## Testing

- Unit: procedure schedules (gate count, KTAS monotonic shed for rejoin/straight-in)  
- Unit: tour remaining → reserve-via-home  
- Unit: selectability unchanged from MeshNav  
- JS: map pan/zoom/follow math; hit-test vs drag threshold  
- Presentation: nav DOM no longer contains handoff/thermal/gross outputs  
- HUD: gate presentation under StraightIn / DownwindRejoin fixtures  
- Manual: Circuits Overhead overlay; zoom-out Crimea tour; inbound switch StraightIn and see boxes/energy

## Success criteria

- Open NAVIGATION reads as an ND, not a second aircraft-systems panel  
- Pilot can plan a zoomed-out tour and still pick a recovery procedure with energy gates  
- Rapier inbound energy is taught by gates, not by leftover TF rows  
- Existing Circuits flythrough teaching still works under Overhead  
- ANCA stays view-only

## Implementation order (after plan)

1. Strip nav DOM/JS to solution strip + grow map chrome  
2. Pan/zoom/follow/drag + Tour kernel/API  
3. RecoveryProcedure director + three schedules  
4. HUD presentation generalization + ND overlay + chips  
5. Stamp / gate  

## Spec self-notes

- Tour and RecoveryProcedure are parallel; do not merge into one list.  
- “Straight-in” is a Mesh recovery procedure, not Jeppesen ILS.  
- Scenery enrichment remains out of scope.
