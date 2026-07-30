# The sparring partner: a first sortie that can be won

Date: 2026-07-30
Status: accepted design, not yet implemented

Related: [complexity ladder](../../complexity-ladder.md),
[adaptive-teacher design](../../adaptive-teacher-design.md),
[ADR-0001](../../adr-0001-f22-first-arcade-pivot.md),
`sim/Doctrine/PilotSkill.cs`, `sim/Doctrine/FightDirector.cs`,
`sim/Doctrine/ReactiveBandit.cs`, `bin/telemetry-report`

## The problem, measured

Guns Only has real players. Vercel Web Analytics records **168 unique visitors** over 30 days;
the private telemetry store holds **150 distinct visitor sessions** across 12 days from **49
distinct phone hardware models**. They arrive overwhelmingly from Threads — `l.threads.com` is 73
of the referrals, and 80 of 150 sessions run inside the Threads in-app browser.

Not one of them has ever killed anything.

The seven-day funnel, from `bin/telemetry-report --deep`:

| Stage | Sessions |
|---|---|
| loaded the sim | 99 |
| started a sortie | 67 |
| fired the guns | 21 |
| landed a hit | 1 |
| **killed something** | **0** |

Across 12 days: 86 visitor sorties, 7,535 rounds attributed to a range, **2 hits, 0 kills**.

### Why they miss

The gun's rounds die at **2,060 m** (1030 m/s muzzle velocity x 2 s maximum flight). Visitors'
**median firing range is 3,716 m**, and **~69% of all rounds are fired beyond 2 km** — outside the
distance the round can physically travel. `lead_valid` is false on 68% of trigger pulls.

They are not misjudging range. They cannot judge it at all. At 3,716 m an 11.3 m wingspan subtends
0.17 degrees — **1.1 pixels** on a 390 px phone viewport. The HUD brackets the contact and prints a
range figure, so the obvious move is to point at the marked dot and shoot. Nothing on screen says
the rounds cannot get there. The gun funnel — the one cue that teaches reach — is drawn only inside
`EFFECTIVE_CEILING_M = 900 m`, and `CameraSolver.GunWindow` requires < 800 m and < 12 degrees. Only
6% of visitor sorties ever reached that window; 1% ever held a firing solution.

Crucially, **the bandit is reachable**: 49% of sorties get inside 1 km at some point and 21% get
inside 300 m, with a closest approach of 16 m. They find him. They just spend their ammunition
before they arrive.

### Why the fight is unwinnable anyway

Deduplicated across 86 visitor sorties, the opponent was:

| Bandit skill | Sorties |
|---|---|
| **ACE** | **59 (69%)** |
| NOVICE | 12 (14%) |
| unrecorded | 15 |

flying an **Su-35S** surrogate in 59 of them, with a coordination role of `BRACKET` (18) or
`PRESSURE` (18) in 36 of the 43 sorties that recorded one. A first-time visitor on a phone is put
in front of an Ace-flown thrust-vectoring fighter running a coordinated two-ship pincer.

## Root cause

`sim/Doctrine/PilotSkill.cs:113` — the cold-start warm-up ladder:

```csharp
public static PilotSkill ForEngagement(int engagementNumber) =>
    engagementNumber >= 1 ? PilotSkill.Ace : PilotSkill.Ace;
```

Both branches return `Ace`. This is deliberate, from `f4ebb07` *"Ship Build 109: the opening fight
is the hardest one"* (2026-07-25), and the reasoning recorded in the surrounding comment was sound:
the previous Novice was capped at 2.40 G against a player pulling 8-12, so it could not turn, could
not convert and never fired. Easing became `FightDirector`'s job instead — drop a tier per fight
while the player is losing.

**That easing can never fire for a visitor.** The director eases on `LossStreak >= 2`, and a loss
requires a completed engagement. Only **4 of 86** visitor sorties reached `sortie_finished`; the
rest end on `pagehide`. The director observes nothing, never eases, and the next session cold-starts
at Ace again.

The ladder is evidence-driven, and it was built for a population that never produces evidence.

**The design consequence: scaffolding must be front-loaded and withdraw on live in-fight evidence,
not back-loaded and arrive after losses that are never logged.**

## Goal

A first sortie a stranger can win, without a mode selection, a tutorial, or a demo to sit through.
They are thrown straight into the fight with enough scaffolding to figure it out.

### Non-goals

- No difficulty menu or "new pilot?" gate. Every tap between a Threads link and the jet costs
  players; 32 of 99 visitors never started a sortie as it is.
- No reversion to the 2.40 G Novice. It was correctly judged a non-event.
- No change to the kernel, the ballistics, or the world. Per the complexity ladder: assistance
  changes who moves a control, never what the world does.

## Design

**The sparring partner is not a bad pilot. It is a co-operative one.** That distinction is the
whole design and is what separates this from the Novice that was removed.

### 1. `BanditTactic.Present`

A new member of the existing `BanditTactic { Acquire, Defend, Energy, Return }` enum. While in
`Present`, the bandit:

- flies a **stable, gently-curving reference line** at a speed the player can match — a formation
  lead, not a target drone;
- **does not defend, does not bracket, does not fire**;
- **holds its line**, so the player's task is closure and station-keeping.

The player's first minute is therefore a join-up. Formation flying and gun tracking are the same
motor skill — closure control and holding position relative to another aeroplane — so the hard part
is taught without the player being told they are being taught.

### 2. Spawn geometry does the visualisation work

Engagement 0 opens the merge at **1,000 m** slant range rather than 5,000. The bandit is then
~4 px and growing rather than 1 px and static, and reads as an aircraft with a visible aspect. The
range problem is solved by putting the player where seeing works, not by adding HUD furniture.

### 3. Withdrawal is per-second, and belongs to the bandit

`FightDirector` carries an explicit determinism contract: *state advances only in `Observe`
(completed engagements), phase commitment happens only at the `NextSpawn` boundary, and the
director never counter-picks mid-fight.* In-fight withdrawal must therefore **not** live in the
director.

It lives in the bandit's own tactic state machine. `FightDirector` selects a sparring-partner
`SpawnSpec` at the spawn boundary and is then finished; the `Present -> Acquire` transition is
computed inside `ReactiveBandit` as a pure function of kernel state. The director's contract
survives intact and replays still reproduce.

**The transition rule** — the entire curriculum in one sentence: the partner leaves `Present` when
the player holds continuous tracking inside the funnel envelope (<= 900 m, within the funnel) for
**2.0 s**. It is a pure function of `range_m`, angle-off and time.

2.0 s is the starting value, not a derived one — it is roughly two burst lengths, matching the
`WalkoverSolutionSecondsConceded = 0.75` grace already used in `FightDirector` for the reciprocal
judgement about the bandit's gun. It is the design's primary tuning knob and is expected to move
once telemetry shows where real players sit.

**Withdrawal is one-way within a sortie.** Falling back out of the funnel does not restore the
scaffolding. Scaffolding comes away as it is earned; it does not yo-yo.

### 4. The voice

`audio/radio/mission/lines.json` already contains an **LSO** role — *"professional landing signal
officer, compact controlled correction"* — which is a coach giving terse corrections against a
stable reference. The join-up is the same shape of problem in a different phase of flight, so the
instructor lines are authored in that idiom and triggered from physical events, exactly as every
other call is: the simulation chooses a catalog ID, the browser never invents dialogue, and
gameplay consumes authored WAVs only.

`PERFORMANCE-CORPUS.md` already specifies silence as a designed property. The voice is quiet while
the player is doing fine. This is what keeps hand-holding from becoming boredom.

## Components

| Change | File |
|---|---|
| Restore a real opening rung for engagement 0 | `sim/Doctrine/PilotSkill.cs` |
| `BanditTactic.Present` + the transition rule | `sim/Doctrine/ReactiveBandit.cs` |
| Sparring-partner `SpawnSpec` at engagement 0: close spawn range, `FormationSize 1`, no coordination role | `sim/Doctrine/FightDirector.cs` |
| Instructor lines in LSO idiom | `audio/radio/mission/lines.json`, `sim/MissionRadio.cs` |
| Emit `bandit_tactic` and the withdrawal trigger | snapshot projection |

## Acceptance test

The whole problem was found on telemetry, so the fix is accepted on the same instrument. A day
after it ships, `bin/telemetry-report --deep` over real visitors must show the funnel move:

```
started a sortie   67          unchanged - they already fly
fired the guns     21   ->     most of them
landed a hit        1   ->     the majority
killed something    0   ->     NOT ZERO
```

`killed something > 0` for a visitor session is the definition of done. It is checkable against
strangers without asking anyone anything.

## Testing

In the idiom of the existing `sim.Tests` suite (`FightDirectorTests`, `AceBanditTests`,
`GunConversionFunnelTests`, `FormationCoordinationTests`):

- a scripted player that holds the funnel graduates the partner out of `Present`;
- a scripted player that does not, does not;
- withdrawal does not reverse within a sortie;
- identical inputs reproduce identical tactic sequences (determinism);
- `FightDirector`'s existing determinism contract still holds with the new spawn path;
- the headless rig flies the opening sortie before anything reaches production.

## Deliberately out of scope

The chase/orbit camera, the extended gun funnel beyond 900 m, and tally-enhancement art at range.
If the join-up puts a player at 1 km looking at a co-operative aeroplane, these may prove
unnecessary. Ship the mechanism, re-read the telemetry, then decide.

## Risks

- **The partner reads as broken rather than co-operative.** A bandit that will not fight can look
  like a bug. Mitigation: it flies a competent, purposeful line and the voice frames it; it is a
  wingman-shaped presence, not an inert target.
- **Withdrawal fires too early on a lucky player**, dropping a genuine beginner into an Acquire
  fight they cannot hold. Mitigation: the sustained-seconds threshold is the tuning knob, and
  telemetry records the trigger so it can be tuned on evidence rather than taste.
- **Returning players get the sparring partner again** because the store forgot them. Mitigation:
  engagement 0 is a cold-start-only path; a learner estimate that already exists skips it.
