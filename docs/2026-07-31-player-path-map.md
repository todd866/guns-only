# Player path map — what a visitor can reach, and whether it works

Written 2026-07-31 against commit `0e8be97` (production build 212), in an isolated worktree so
nothing here touched the checkout while a production deploy was running.

Method: static read, **plus** live drives of production, **plus** headless runs of the published
build in Chromium (five front-door sorties, six sub-apps, the indoor kernel, the casevac runtime).
Every load-bearing claim below was re-checked by grep or arithmetic against the source, not carried
from an agent's summary. Where something was only reasoned about and not flown, it says so.

---

## 1. The complete reachable surface

| Path | Reached by | Status | One line |
|---|---|---|---|
| **Bare desktop visit** | type the URL, wait | **TRAP** | Auto-departs mission 7 on the first rendered frame. The menu is never shown. |
| **Bare mobile visit** | phone | works | `mobileControls` suppresses auto-launch, so the tile menu *is* the front door. Desktop and phone are different products. |
| `first-merge` (beat 7) | tile 1 / desktop auto-launch | works | Endless F-22A vs Su-27S guns merge. Live bandit, scored, no feature pack, no terrain interlock. |
| `low-level-drone` (8) | tile 2 | works | Four raiders, one hit kills, defended point, scored termination. Best-formed mission in the game. |
| `medevac` (13) | tile 3 | **degraded — lethal on its own brief** | §4. |
| `rapier-circuits` (11) | tile 4 | works, **no win state** | No enemy, no gun, `RecoveryCompletesSortie = false`. Fly circuits forever; nothing completes. |
| `rapier-intercept` (12) | tile 5 | works, non-deterministic | `12 => RapierGoFly(jobSeed: 0)`; seed 0 falls through to wall-clock, so "try again" silently re-deals a different mission. |
| **Indoor** (`/indoor/`) | tile 6 | **degraded — advertised controls are instant losses** | §4. The only outbound link on the front door. |
| Pause card | Escape, or an unlabelled `Ⅱ` glyph | degraded | Sole route from a sortie back to the menu. Escape is taught nowhere. |
| Debrief card | sortie ends | works | The casevac debrief is genuinely good — and is the only place the orchard hazard is ever named. |
| HAND OFF FIGHT & RTB | pause → button, or `O` | degraded | Fires and can end the sortie. Everything in between is unguided — §4. |
| `?program=<id>` | URL | works | 5 valid ids. `?program=constructor` (and `toString`, `valueOf`, `__proto__`) prints the literal string "undefined" on the title card — plain-object lookup with no `hasOwnProperty` guard. |
| `?mission=N` | old bookmark | **dead** | Stripped before it is read. `?mission=13` opens first-merge and, on desktop, auto-launches the dogfight. |
| `?audioQa=silent` | URL, ungated on prod | works | A shared link carrying it ships a permanently muted game. |
| Asset / effects / environment labs, `/present/rapier-design/`, `/medevac/` | typing the URL only | shipped, unlinked | All return 200. `/present/` itself 404s. |

---

## 2. Blockers ranked by "would a stranger hit this in the first two minutes"

**1 — Desktop visitors never see the menu.** `web/wwwroot/app.js:2232`:

```js
let autoLaunchPending = !mobileControls && requestedProgramNode?.id !== "medevac";
```

With no `?program=`, `requestedProgramNode` is null, `null?.id !== "medevac"` is true, and the app
departs mission 7 on the first presented frame. **Every desktop stranger is dropped into the
always-Ace guns merge and never learns Medevac, the Rapier or Indoor exist.** The only way back is
Escape → "Mission program", and nothing on screen says Escape does anything. This is one boolean,
and it is the highest-leverage line in the front door. It also reframes the conversion data: those
150 sessions were not people choosing the merge, they were people given no choice.

**2 — The escape hatch is invisible.** For both populations. The pause affordance is a 44 px
unlabelled `Ⅱ` with an aria-label only; the in-flight legend lists R/M/H and omits Escape; `R`
restarts the *same* mission rather than going back. A stranger who dislikes the merge has no
discoverable exit but the browser back button.

**3 — Indoor: four of the eight advertised controls are instant, unexplained deaths.** §4.

**4 — Medevac kills you for obeying its own brief.** §4.

**5 — After any medevac ending you are stuck in medevac.** The pause/menu card is made `inert`
behind the casevac debrief, Escape is a deliberate no-op once finished, and the pause button is
`display:none` while paused. The debrief's only button is FLY AGAIN. (Worth noting how this hid:
`inert` blocks human clicks and Tab but scripted `.click()` still works, so an automated pass
reports the card as reachable.)

**6 — "Fly" is disabled for the first ~3 s of every visit**, and indefinitely if a deploy lands
while the tab is open — `buildIdentityBlocksSortie()` feeds `readyStart.disabled`.

**7 — Required scenery has a 15 s hard deadline, no retry, and a misleading message.** Measured,
not reasoned: the three feature-pack missions (`low-level-drone`, `rapier-circuits`,
`rapier-intercept`) interlock the Fly button until terrain warms up, on a 15 s `setTimeout`. Miss it
and `terrainLaunchWarmupFailedKey` latches, the sortie stays interlocked **for the rest of the
session**, and the ready-screen hint still reads *"Loading nearby terrain and low-level scenery…"*
— an infinite spinner. Under software rendering the warmup genuinely needs **42 s**; raising only
the deadline unlocked it cleanly, so the machinery is sound and the budget is what fails. This does
not fire on a desktop GPU — production drove fine. It is a phone-and-cold-CDN tail risk, on a game
whose real traffic spans 49 phone models. The fail-closed intent is right; the "no retry, no honest
message" part is not.

**8 — Visiting Indoor wipes the offline install.** `indoor/game.js:1407` and `medevac/app.js:1029`
register `../service-worker.js` with no `?v`. The front door's preboot gate reads the controller's
`?v`, gets null ≠ "212", and unregisters every worker and deletes every `guns-only-*` cache. Two
strings.

---

## 3. Shipped but unreachable

**Missions.** `Beats.BuiltIn` ships 13 indices; the menu exposes 5 (7, 8, 11, 12, 13). Unreachable:
Perch (1), BreakDefense (2), Saddle (3), BalloonStrike (4), F35CCarrierApproach (5),
EmergencyGearRecovery (6), ModernAceDuel (9), RapierIntercept (10).

Two factories have **no index at all**: `CarrierApproach()` and `KoreaCarrierApproach()`. Verified
directly — `KoreaCarrierApproach` is defined at `sim/Doctrine/Beats.cs:816` and referenced only from
`sim.Tests/KoreaCarrierBeatTests.cs`. **The F9F-2 Panther on the Korean-War axial deck — the
aircraft the whole paddles/LSO/M3-doctrine subsystem exists for — has zero player entry points.**
It is tested and unplayable.

**The deck-configuration axis is dead.** The selector is hidden unconditionally on every menu render
while `C` still silently toggles it and re-stages the sortie. Its only consumers are beats 5 and 6,
which have no tile — and `RapierIntercept`'s `configuration` parameter is threaded through beats
10/11/12 and never read (`Beats.cs:896` hard-codes `Axial`).

**Also orphaned:** `MISSION_BRIEFS` 1–6, the "ace-duel" and "endurance-merge" campaign briefs, the
F-86 test-flight console, the incident-replay overlay, and `campaignNodeQualified()` (now
`return false`).

**Copy drift:** "Pick a mission" vs "Pick an aircraft"; "Five flight experiences" above six tiles.

---

## 4. The three named suspicions

### Medevac — broken *as designed*, not as code. Confirmed.

Everything compiles, the phase machine terminates cleanly, the feature pack sha-matches, and
`CasevacFlightRuntimeTests` flies the real runtime to `Complete`. It is still lethal on the profile
it briefs.

The brief says *"the assessed safe masking band is 12–42 m AGL"*. The obstacle
`obstacle.casevac.orchard-exclusion.v1` is an axis-aligned box `(-650, 0, -50) → (-250, 28, 350)` —
**28 m tall, sitting on the ground, straddling the start→pickup line**. Add the 2.6 m vehicle
collision radius and the lethal ceiling is **30.6 m AGL**. So **62% of the sanctioned band is an
unmarked kill box** across the last ~600→300 m of the ingress, and one contact is fatal.

Three things make it worse:

- **In-flight guidance points at the pickup site centre**, dead through the box. The aircraft even
  spawns on that heading.
- **The fix already exists as authored data and is not wired to flight.** There is a waypoint
  literally named `ingress-direct.orchard-gap` at (-180, 380) that rounds the box. It is drawn only
  on the *ready screen*; the in-world landmark renderer structurally excludes it.
- **The green test encodes a profile the game never teaches.** The test autopilot holds a constant
  MSL altitude referenced to the pickup datum, with ~3.4 m of margin. The HUD and brief speak only
  in AGL.

Blocker is **guidance geometry, not code**. Project the authored route into flight guidance, raise
the band floor above 31 m, or move the box off the ingress line.

### Indoor drone — not broken. It is the most finished thing on the site, and it is a trap.

The loop closes: the shipped default mission was flown headlessly to `status=success` in 10.45 s
using 28.80 m of a 58 m fibre budget. Objective reachable, termination real, feedback present.

What is broken is the *contract*. `stealth-mandatory` is the default doctrine, and **X (detach), F
(fire), and hold-B (broadcast) each call `setSurveyStealthBreach` → instant failure** — while all
three are printed as normal controls on the briefing and the help card, the DETACH button is
visible the whole time, and `#touch-fire` is never hidden. Wall contact kills in 0.55 s with ~0.2 s
of warning. And then every one of those deaths is explained with copy about a *deleted* mission
type, because `outcomeCopy` has no entry for any of the five stealth-breach reasons.

One further dead end: pressing **R** before the scans finish is ungated on the keyboard (the
buttons *are* gated), sets authority to 0, and authority can never recover on a fibre link —
measured **939 s of zero control** while the HUD reassures you "SILENT RETURN / No emissions".

The smoke test cannot catch any of this: it asserts the default is `attack-site`, then **clicks over
to `discretionary-site` before pressing Begin**, because detaching on the default would fail the
mission. The shipped default has no automated coverage past the briefing screen.

### RTB golden path — broken. The instinct was right, and the failure is not where the design doc says.

The documented defect is real and unchanged (`stabiliseSpeedMps: 90.0` for every airframe,
`dragToWeight` still `const 0.12`). But that defect is currently *harmless, because the thing it
feeds is not rendered*:

- **Five of the seven `golden_path_*` fields have zero consumers.** Verified by grep on both sides:
  `web/SnapshotProjection.cs:929-935` emits seven; the only readers anywhere in `wwwroot` are
  `hud.js:2641-2642`, reading `golden_path_power_01` and `golden_path_valid`. There is no ribbon, no
  target-altitude bug, no target-speed bug. The descent schedule is dead payload.
- **The one surviving instrument is one-sided by construction.** `sim/Recovery/GoldenPath.cs:82`
  computes `scheduledEnergy = Math.Min(currentEnergy, allowedEnergy)`, so `energyError` at :109 is
  `>= 0` by construction, so `commandedPower = Clamp(0.5 - energyError/(2*band), 0, 1)` at :111 is
  **always ≤ 0.5**. The comment three lines above says "below it, to add" — that half cannot exist.
  The caret shares its scale with the throttle lever, so "follow the bug" means "never exceed half
  throttle on approach". The test asserts `InRange(0.2, 0.8)` on a case returning exactly 0.5, and
  is green.
- **Nothing arms it.** It only exists after the player opens a collapsed `<details>` and presses a
  PROC button. No beat, no fuel state, no handoff arms it; until then `UpdateGoldenPath` early-returns.
- **Nothing points home.** The RTB steer panel is gated on a *fuel emergency*. Hand off voluntarily
  at healthy fuel and the game announces "RETURN TO BASE" and then declines to say where base is —
  44.1 NM away, with time compression unavailable on that mission.
- **The last 800 m are unguided and the schedule reverses.** `distanceToGoM` is an unsigned 2-D
  range to the last gate, so once you overfly it the distance *grows*, the energy budget re-opens,
  and the schedule commands you back up toward 152 m at 400 m from touchdown.
- **`stabiliseAltitudeM: 152.0` is absolute MSL, not AGL.** The Rapier strip sits at 192.0 m — the
  schedule's floor is **40 m below the pavement**.
- **Land without pressing `O` and nothing happens, ever.** Completion requires `PlayerRtbActive`.
  There is a test asserting exactly this: aircraft parked on the runway, lifecycle Active, outcome
  None, bandit still hunting.
- **Nobody has ever flown it.** Every runway test teleports the aircraft to 5 cm above the pavement.
  Across 129,501 real telemetry rows, `runway_recovery_phase_name` had exactly one value: AIRBORNE.

---

## 5. Not settled by reading — must be flown

1. **Is there a reachable kill for a stranger in first-merge or low-level-drone?** Both reach
   `ACTIVE` with live opposition; neither was flown to a kill. This is still the open question from
   the conversion crisis.
2. **The full 44 NM RTB**, merge → Soniachne West → stop. Never flown by human or test.
3. **The medevac pickup contact gate** — 6 m radius, ≤0.45 m/s lateral, ≤0.25 m/s vertical, ≤5°
   pitch/bank, 2 s stable. Never achieved by a human. Ground speed was still 24 m/s three seconds
   after key release.
4. **Medevac terrain profile** along the ingress line — the "level flight survives it" conclusion
   rests on a single live observation.

---

## Cheapest high-value fixes

1. Delete `!mobileControls &&` at `app.js:2232` — desktop sees the menu.
2. Project `ingress-direct.orchard-gap` into flight guidance, or raise the medevac band floor above 31 m.
3. Add the five stealth-breach reasons to `indoor/game.js` outcome copy; hide `#touch-fire` and
   reject F under stealth-mandatory instead of failing the mission.
4. Add `?v=<build>` to the two sub-app service-worker registrations.
5. Label the pause affordance and add Escape to the in-flight legend.
6. Give the terrain interlock a retry and an honest message.
