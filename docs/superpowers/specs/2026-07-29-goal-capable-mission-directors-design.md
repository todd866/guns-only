# Goal-capable mission directors (Rapier Intercept v1)

**Date:** 2026-07-29  
**Status:** Approved design (brainstormed with owner); implementation plan to follow  
**Builds on:** `RapierMissionDirector`, zoom-lob (`2026-07-27-rapier-zoom-lob-design.md`),
ANCA AI-first doctrine (`2026-07-29-anca2040-design.md`),
`docs/airframes/rapier/00-mission-and-ops.md`

## One sentence

Mission directors stop being ladders of magic-number admission tickets and become
**goal agents**: from any present state, pick an intention and a strategy that progress
the sortie goal, then command the same `PilotCommand` path as today.

## Why

Today’s Intercept path is:

`Climb (FL560) → Accelerate (M2.2) → RamClimb (FL700) → Intercept → Attack (≤30 km)`

Altitude and Mach gates are **locks**. An airborne attach below FL700−200 ft cannot
enter Intercept; zoom-lob exists only behind `ZoomLobProfile`. That fights the product
thesis: goal-capable AI is a key technology for the whole sim, and directors are the
first place it should show up.

FL700 / M2.2 / FL560 remain **useful FD bugs and strategy parameters**. They must not
be admission tickets.

## Scope (v1)

| In | Out |
| --- | --- |
| Pre-Attack path for FormationIntercept / default Intercept | Circuits / PatternOnly rewrite |
| Strategy choice among ClimbBuild, LevelDash, ZoomLob, DirectJoin | General trajectory planner / A* |
| Intention tokens on guidance / snapshot (cheap) | RecoveryProcedure redesign |
| Soften OFT / anca-audit cards that assume FL700 prison | New airframe physics |
| Go Fly may still prefer ZoomLob via config | ANCA panel redesign beyond publishing tokens |

Follow-up slices: Circuits as goal-gated pattern legs; shared intention vocabulary across
Casevac / RecoveryProcedure; richer scoring.

## Architecture

```
Mission goal (FormationIntercept)
        │
        ▼
Intention picker
  SurviveAviate → ReachFightGeometry → Employ → Separate → Recover
        │
        ▼
Strategy (ReachFight only)
  ClimbBuild | LevelDash | ZoomLob | DirectJoin
        │
        ▼
RapierMissionPhase + phaseReason + PilotCommand
  (existing cue / FD switch; phases are labels, not locks)
```

`RapierMissionDirector.Step` stays the public surface (session, beats, OFT, radio).
Pre-Attack ladder logic moves into a deep module (working name **`ReachFightDirector`**):

| | |
| --- | --- |
| **In** | Ownship alt / Mach / q / γ; contact range & closure; fuel vs reserve; optional ZoomLob preference |
| **Out** | Intention token, strategy token, suggested phase + `phaseReason` |
| **Does not** | Emit PilotCommand, own recovery/pattern-only, invent physics |

Hysteresis on strategy changes so ClimbBuild ↔ ZoomLob does not thrash every tick.
Re-score every tick is fine if the winner must beat the incumbent by a margin, or
re-score only when phase-stable / on significant state jumps.

## Intentions

| Intention | Done when | Priority vs others |
| --- | --- | --- |
| **SurviveAviate** | Catapult inactive; not in a forbidden failure box | Highest — existing Launch / computer-failure paths win |
| **ReachFightGeometry** | Hand off when Employ’s range gate is met with a soft energy floor | Default while live opponents remain and not yet Attack |
| **Employ** | Attack phase / gun-drone commit | Contact ≤ ~30 km (same trigger as today); soft energy floor avoids “Attack while dead slow” |
| **Separate** | Pursuit active / post-gun egress | Existing Escape overrides |
| **Recover** | No opponents → RTB / Recovery / Complete | Existing home-range paths |

Picker is **priority + predicates**, not a search tree. Live-opponent, pursuit, and
gun-drone egress overrides keep today’s shape.

### ReachFight → Employ handoff (explicit)

Not “Y ≥ FL700.” Handoff when **both**:

1. Contact range ≤ attack gate (~30 km), and  
2. Soft energy floor passes (named Mach/q constants on the ReachFight module — enough to
   Employ, not a cruise-shelf lock).

Until then, stay on ReachFight and pick a strategy. DirectJoin still selects Intercept
phase while closing; only the handoff above enters Employ/Attack.

## Strategies (ReachFight)

| Strategy | Prefer when | Maps to phases / cues |
| --- | --- | --- |
| **ClimbBuild** | Low / slow; need TBCC overlap before thin-air work | Climb → Accelerate → RamClimb (parameters: FL560, M2.2, FL700 *targets*) |
| **LevelDash** | Already thin + fast enough to close without loft | Intercept dash at cruise shelf |
| **ZoomLob** | Long range + energy available; loft/coast closes cheaper | Existing ZoomPull → ZoomCoast → ReenterAlign → DipRelight |
| **DirectJoin** | Already in/near fight box (airborne attach, mid-dash, post-lob) | Skip to Intercept / Attack without ClimbBuild restart |

### Scoring (v1 — greedy, not a planner)

Each eligible strategy gets a rough score, e.g.:

- Progress: expected closure / time-to-employ (or range remaining after a lob skip)
- Cost: fuel above reserve; risk of another skip when fuel is tight
- Fit: hard disqualify if state makes the strategy nonsense (e.g. ZoomLob with no
  energy and contact already inside 30 km → DirectJoin / Employ)

Pick max score subject to hysteresis. No A*, no trajectory search.

### `ZoomLobProfile` semantics

| Config | Behavior |
| --- | --- |
| `true` (Go Fly) | Force or heavily weight ZoomLob until post-lob Intercept |
| `false` (default Intercept) | **May** still choose ZoomLob when it scores best; LevelDash / DirectJoin remain available |

Zoom-lob is a **strategy toward ReachFightGeometry**, not a separate beat religion.

## Edges

- **Airborne attach** mid-Intercept or mid-dash → DirectJoin; do not restart ClimbBuild.
- **Already ≥ cruise shelf or mid-zoom** → never force `ram_climb_to_fl700`.
- **Fuel near reserve** → bias LevelDash / DirectJoin; suppress further lob skips
  (existing `ShouldAnotherLobSkip` fuel check stays / feeds the scorer).
- **PatternOnly / Circuits / RecoveryProcedure** → unchanged; out of scope.
- **Phase enum** → keep for HUD / radio / OFT continuity; reasons stay stable tokens.

## Snapshot / observability

Publish stable tokens on guidance (and snapshot if already mirroring mission guidance):

- `intention` — e.g. `reach_fight`, `employ`, `separate`, `recover`
- `strategy` — e.g. `climb_build`, `level_dash`, `zoom_lob`, `direct_join`

ANCA / audit / OFT may show them; no panel redesign required in v1.

## Testing & acceptance

1. Start states that must reach Employ **without** a FL700 prison:
   - FL400 / mid-Mach
   - FL650 (below old −200 ft gate)
   - Already M3 dash at cruise
   - Mid-ZoomCoast / post-DipRelight
2. Default Intercept **may** enter ZoomPull when long-range score wins (not only when
   `ZoomLobProfile`).
3. Existing zoom-lob unit/OFT beds stay green; Intercept energy-ladder OFT treats
   FL700 / M2.2 as soft curriculum metrics where they conflict with goal join.
4. `tools/anca-audit` Intercept geometry card must not require camping FL700.
5. Director unit tests cover strategy hysteresis and DirectJoin from airborne attach.
6. `./bin/check` (or documented subset) green before merge.

## Non-goals (v1)

- Full mission planner / MDP / learned policy
- Rewriting Circuits pattern legs as goals
- Replacing RecoveryProcedure
- Changing propulsion, aero, or RCS physics
- Redesigning the ANCA panel layout
- Removing phase labels from the HUD

## Doctrine link

ANCA2040 trains for a battlespace where machines hold shared state and act toward goals.
A director fixated on FL700 is the opposite of that. This slice makes Intercept the first
**goal-capable** director; later directors should reuse intention / strategy vocabulary
rather than invent new magic-number ladders.

## Implementation order (indicative)

1. Extract ReachFight decision from the pre-Attack `else if` ladder; add intention/strategy out-params with ClimbBuild-equivalent behavior (characterization).
2. Add DirectJoin + remove FL700 admission lock; green airborne-attach tests.
3. Score LevelDash vs ZoomLob vs ClimbBuild with hysteresis; allow ZoomLob on default Intercept.
4. Retune OFT / anca-audit cards; publish snapshot tokens.
5. Plan file + land on `pivot-hardening` (or agreed branch).
