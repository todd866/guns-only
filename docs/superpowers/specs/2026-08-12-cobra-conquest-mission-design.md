# Cobra conquest mission — design

2026-08-12. Owner-approved. The answer to "the mission still sucks, we need to do *way*
more on the game-front" plus "build the laptop game first."

## The diagnosis this fixes (evidence, not opinion)

- **The player is a rounding error.** Victory is the ground war's global `control` reaching
  0.55 and holding 45 s. Units fight each other autonomously and move that number
  themselves; the player's best single contribution (`ApplyPlayerKillPulse`, hardpoint) is
  **+0.12**. A seeded wave once won the mission in under 10 s with zero player input
  ([[diagnosis-2026-08-05-cobra-bike-f22]], and the comment at `GroundWarTypes.cs:93`).
- **Nothing pulls the player off the pad.** Production telemetry
  `web-cobra-1786513462176` (Build 312): 85 s, never more than 174 m from the FOB,
  **900 rounds unspent**, `fire_authorized` false in all 661 rows, 0 kills.
- **The objective is an invisible number.** `control` has no on-screen representation; the
  player cannot see the bridge being contested.

## What already exists (this is a promotion, not a new subsystem)

`sim/Cobra/GroundWar/`: `ContestedSite` with `LocalControl`, `GroundUnit` with
`MoveSpeedMps` + `SetPosition`, units that already advance toward contested sites, and
mutual combat. Conquest is these parts made visible and made to depend on the player.

## Decisions (the contract)

1. **Conquest: points + tickets.** BF:V's structure literally.
2. **The player clears; friendlies capture.** A gunship never takes a flag.
3. **Map: corner minimap + pull-up full map.**
4. **Laptop-first.** Phones get a dismissible recommendation card, never a gate
   ([[laptop-first-mobile-is-a-separate-game]]).

## Design

### Conquest points

Each `ContestedSite` becomes a capture point with explicit `Owner` (Friendly / Hostile /
Contested) derived from living units inside its capture radius:

- Only **ground units** capture. The Cobra's presence contributes nothing to capture.
- A point flips toward the side with living units inside the radius when the other side
  has none, over a capture interval (seconds, not instant).
- Each hostile-held point garrisons a **hardpoint defender** that friendly infantry cannot
  beat unaided — verified by the existing mutual-combat resolution, tuned so a friendly
  push against an intact hardpoint stalls and dies. **This stall is the player's job.**
  Killing the hardpoint lets the already-implemented friendly advance take the point.

### Tickets and outcome

Replaces the global control threshold entirely:

- Both sides start with a ticket pool. A side holding **fewer** points bleeds tickets at a
  rate scaled by the point deficit. Zero tickets ends the mission for that side.
- `HoldTheBridgeOutcome` keeps its Victory/Defeat shape so existing callers survive; the
  driver underneath changes from `control ≥ 0.55 for 45 s` to tickets.
- The old global `control` stays as a derived readout (it feeds existing HUD/telemetry),
  but it stops being the win condition.

### The tactical map

One data source: the authority snapshot. Two surfaces:

- **Minimap** (always on, corner): points with ownership colour, player position/heading,
  ticket bars, nearby contacts. North-up.
- **Full map** (pull-up, key on laptop): the whole Camp Ember → Long Fang → Iron Bell
  corridor, all points with ownership and capture progress, friendly/hostile unit
  positions, ticket counts, and the player.

Both render from the same projected model in a new
`web/wwwroot/render/cobra/cobra_tactical_map.js` (pure geometry/state → drawable model,
testable headless) with a thin canvas drawing layer. **The map must never invent state the
sim does not publish** (one-engine doctrine).

### Laptop recommendation

A dismissible front-door card on phone viewports: built for a laptop or desktop, because
flight controls, the tactical map and the instrument set need a keyboard and a real
screen. Dismissal persists. No gating, no removal of mobile code.

## Acceptance

- **Deterministic:** an intact hostile hardpoint makes a friendly push stall (point does
  not flip within N seconds); killing that hardpoint lets the same push flip it; ticket
  bleed follows point deficit; same seed + same inputs → identical outcome. Each gate
  demonstrated to fail against pre-change code.
- **Legibility:** the map shows point ownership changing as it happens; rendered-frame QA
  against a real flight.
- **Owner flight (the real gate):** flying the corridor to clear points and watching the
  tide move is worth doing, and the player's absence visibly loses the battle.

## Out of scope

AA threat and subsystem damage (Build 314, already designed); infantry as characters;
multiplayer conquest; corridor scenery density; any mobile-specific work beyond the card.
