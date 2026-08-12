# Cobra Conquest Mission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Hold the Bridge from a self-resolving simulation into a conquest battle the player can see on a map and change with the gun.

**Architecture:** Promote the existing `ContestedSite` (which already has `LocalControl`, a capture radius, and units that advance toward it) into an owned capture point; make ownership depend on living ground units in the radius; garrison hostile points with a hardpoint that stalls friendly pushes until the player kills it; replace the global control-threshold win condition with tickets driven by point deficit. Present all of it through one pure map model consumed by a corner minimap and a pull-up full map.

**Tech Stack:** .NET 8 sim (xUnit), three.js/canvas presentation, node 24 tests. Env exactly as `docs/superpowers/plans/2026-08-12-camp-ember-firebase.md`.

## Global Constraints

- **Laptop-first.** Do not build touch controls, portrait tiers, or mobile scenarios for any of this. Phones get one dismissible card (Task 5). Do not delete existing mobile code.
- **One engine.** The map renders only state the sim publishes in the authority snapshot. No second source of truth, no presentation-side inference of ownership.
- **The Cobra never captures.** Only ground units capture. The player's influence is exclusively through killing defenders.
- **Determinism**: no randomness in capture, tickets, or advance. Same seed + inputs → same outcome.
- **Control experiment on every new gate** — each test demonstrated to fail against pre-change code before the implementation lands.
- Stage explicit paths; branch `feature/cobra-conquest` off main once Build 313 merges.

---

### Task 1: Points get an owner

**Files:**
- Modify: `sim/Cobra/GroundWar/GroundWarTypes.cs` (`ContestedSite`, ~line 124)
- Modify: `sim/Cobra/GroundWar/CobraGroundWarRuntime.cs` (site update pass; `Sites` already exposed at ~line 121)
- Test: `sim.Tests/Cobra/CobraGroundWarTests.cs` (follow the existing runtime-construction idiom in `CobraMissionRuntimeTests`)

**Interfaces:**
- Produces: `enum GroundSiteOwner { Friendly, Hostile, Contested }`; `ContestedSite.Owner` (get); `ContestedSite.CaptureProgress` (double 0..1 toward the *other* side); `ContestedSite.SetOwnership(GroundSiteOwner owner, double progress)`. Tasks 2-4 read `Owner`/`CaptureProgress`.

Ownership rule (the contract): count living units of each faction whose position is within `CaptureRadiusM` of the site. If exactly one faction is present, `CaptureProgress` advances toward that faction at `CaptureRatePerSecond = 1.0 / 20.0` (20 s to flip a point) and `Owner` becomes that faction at 1.0. If both or neither are present, progress holds. Ownership never changes without a living unit present.

- [ ] **Step 1: Write the failing test** in `sim.Tests/Cobra/CobraGroundWarTests.cs`:

```csharp
[Fact]
public void ASiteFlipsOnlyWhileExactlyOneFactionStandsInIt()
{
    var runtime = new CobraGroundWarRuntime(
        CobraCanyonDefinition.Create(), new FlatTerrain(), seed: 4242);
    ContestedSite site = runtime.Sites[0];
    runtime.OverrideSiteOccupancyForTests(site.Id, friendly: 1, hostile: 0);
    for (int i = 0; i < 120; i++) runtime.Advance(0.25);   // 30 s, one faction present
    Assert.Equal(GroundSiteOwner.Friendly, site.Owner);

    runtime.OverrideSiteOccupancyForTests(site.Id, friendly: 1, hostile: 1);
    GroundSiteOwner held = site.Owner;
    double heldProgress = site.CaptureProgress;
    for (int i = 0; i < 120; i++) runtime.Advance(0.25);   // contested: frozen
    Assert.Equal(held, site.Owner);
    Assert.Equal(heldProgress, site.CaptureProgress, 6);
}
```

- [ ] **Step 2: Run — expect FAIL** (`--filter "FullyQualifiedName~ASiteFlipsOnly"`), compile error: `GroundSiteOwner` / `Owner` / `OverrideSiteOccupancyForTests` do not exist.
- [ ] **Step 3: Implement** the enum, the two properties, `SetOwnership`, the per-advance occupancy count + progress integration in the runtime's site pass, and a test-only `OverrideSiteOccupancyForTests(string siteId, int friendly, int hostile)` that pins the counts (mirroring the existing `OverrideControlForTests` idiom at `CobraGroundWarRuntime.cs:164`).
- [ ] **Step 4: Run the new test + `--filter "FullyQualifiedName~CobraGroundWar"` — all PASS.**
- [ ] **Step 5: Commit** `Give ground sites a real owner and capture progress.`

### Task 2: The garrison the player must break

**Files:**
- Modify: `sim/Cobra/GroundWar/CobraGroundWarRuntime.cs` (unit seeding + mutual combat resolution)
- Test: `sim.Tests/Cobra/CobraGroundWarTests.cs`

**Interfaces:**
- Consumes: Task 1's `Owner`.
- Produces: every `Hostile`-owned site seeds one `GroundUnitRole.HardPoint` unit at its centre, id `"<siteId>.garrison"`. While that unit is alive, friendly units inside the radius take enough attrition that their count cannot sustain (they die faster than they arrive) — so `Owner` cannot flip. Killing it lets Task 1's rule proceed unchanged.

- [ ] **Step 1: Write two failing tests.** (a) *stall*: hostile site with garrison alive, friendly push seeded → after 60 s the site is still `Hostile`. (b) *break*: identical setup, but kill the garrison via the existing player-kill path at t=0 → the same push flips it to `Friendly` within 40 s. Assert the garrison's presence is the ONLY difference between the two.
- [ ] **Step 2: Run — expect FAIL** (currently the push flips it either way; this is the control experiment that proves the stall is real).
- [ ] **Step 3: Implement** garrison seeding for hostile-owned sites and the attrition weighting in mutual combat.
- [ ] **Step 4: Run both + the full ground-war filter — PASS.**
- [ ] **Step 5: Commit** `Garrison hostile points so only the gunship can break them.`

### Task 3: Tickets replace the control threshold

**Files:**
- Modify: `sim/Cobra/GroundWar/CobraGroundWarRuntime.cs` (`VictoryControlThreshold` etc. ~lines 47-56, `MissionOutcome`)
- Modify: `web/CobraWebBridge.cs` (ground-war block: publish points + tickets)
- Test: `sim.Tests/Cobra/CobraGroundWarTests.cs`

**Interfaces:**
- Consumes: Task 1 `Owner`.
- Produces: `FriendlyTickets` / `HostileTickets` (double, start `StartingTickets = 300`); bleed = `TicketBleedPerSecondPerPoint = 0.5 × (points held by the other side − points held by you)` when that difference is positive; `MissionOutcome` becomes Victory when `HostileTickets <= 0`, Defeat when `FriendlyTickets <= 0`. `MissionOutcomeReason` = `"tickets-exhausted"`. The old `control` value survives as a derived readout for existing HUD/telemetry consumers; the thresholds stop driving the outcome. Snapshot gains `ground_war.points[] = {id, label, east_m, north_m, owner, capture_progress}` and `ground_war.tickets = {friendly, hostile}`.

- [ ] **Step 1: Write the failing test:** with 3 of 4 points friendly-held and pinned, hostile tickets fall and friendly tickets hold; the mission ends Victory with reason `tickets-exhausted`; and a 2-2 split bleeds neither side.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** tickets, the outcome switch, and the snapshot fields.
- [ ] **Step 4: Run ground-war + `FullyQualifiedName~CobraMissionRuntime` filters — PASS** (the mission runtime's existing victory/defeat plumbing must survive unchanged).
- [ ] **Step 5: Commit** `Decide the battle with tickets and held points, not a hidden number.`

### Task 4: The tactical map

**Files:**
- Create: `web/wwwroot/render/cobra/cobra_tactical_map.js` (pure model: snapshot + viewport → drawable primitives)
- Create: `web/wwwroot/render/cobra/tests/cobra_tactical_map.test.mjs`
- Modify: `web/wwwroot/cobra-lab/main.js` (minimap canvas each frame; `M` toggles the full map)

**Interfaces:**
- Consumes: Task 3's `ground_war.points` / `ground_war.tickets`.
- Produces: `cobraTacticalMapModel({ points, tickets, player, bounds, widthPx, heightPx })` → `{ points: [{x, y, owner, progress, label}], player: {x, y, headingRad}, tickets: {friendly, hostile} }`, north-up, world→pixel by linear fit inside `bounds`. Pure: no canvas, no DOM.

- [ ] **Step 1: Write the failing test:** a point at the bounds' north-west corner maps to the top-left pixel region; the player's heading maps to a rotation, not a position; ownership passes through unchanged; a point outside bounds is clamped to the edge and flagged `offMap: true`.
- [ ] **Step 2: Run (`node --test …/cobra_tactical_map.test.mjs`) — expect FAIL.**
- [ ] **Step 3: Implement** the model, then the two canvas surfaces in `main.js`: a corner minimap (always on, ~180 px) and a full-screen overlay on `M` showing the whole corridor with labels and ticket bars.
- [ ] **Step 4: Run the node test + `node --check web/wwwroot/cobra-lab/main.js` — PASS. Then rendered-frame QA:** publish, drive the live page, screenshot minimap + full map, and READ them — points visible, ownership colour legible, player marker correct.
- [ ] **Step 5: Commit** `Draw the battle: minimap and pull-up tactical map.`

### Task 5: Laptop recommendation card

**Files:**
- Modify: `web/wwwroot/index.html` + the front-door shell script that owns cards (locate with `rg -n "onboarding|front-door card" web/wwwroot/app.js`)
- Test: whichever front-door test file covers shell copy (`rg -l "front door" web/wwwroot/render/**/tests`)

- [ ] **Step 1: Failing test** — on a phone-width viewport the shell exposes a dismissible element whose copy contains "laptop"; dismissal persists; on desktop widths it never appears; it never blocks launching.
- [ ] **Step 2-4:** implement, verify, screenshot at phone width.
- [ ] **Step 5: Commit** `Tell phone visitors this game wants a laptop.`

### Task 6: Ship

- [ ] Live-page QA on a laptop viewport: fly the corridor, clear a garrison, watch the point flip on the minimap, confirm tickets move. Screenshot each.
- [ ] Adversarial review: `cursor-opinion` with the changed files AND their tests in the bundle; Codex scoped to `sim/Cobra/GroundWar/*.cs` only, `--effort xhigh`, with an explicit no-dotnet warning (its sandbox has no .NET 8 and it times out otherwise).
- [ ] Reconcile `docs/STATUS.md` → stamp LAST (`bin/stamp-release --next <N>`) → full `bin/check` (final line must read "Guns Only checks passed") → PR → CI → merge → deploy → verify `/api/build-info`.

## Self-review notes

- Spec coverage: points+ownership (T1), the stall the player breaks (T2), tickets+outcome+snapshot (T3), minimap+full map (T4), laptop card (T5), acceptance/ship (T6). Out-of-scope items (threat, infantry, multiplayer, scenery) appear in no task.
- Type names used once and reused: `GroundSiteOwner`, `ContestedSite.Owner`, `ContestedSite.CaptureProgress`, `SetOwnership`, `OverrideSiteOccupancyForTests`, `FriendlyTickets`/`HostileTickets`, `cobraTacticalMapModel`.
- The Cobra-never-captures constraint is enforced structurally: capture counts only ground units, and no task gives the player an occupancy contribution.
