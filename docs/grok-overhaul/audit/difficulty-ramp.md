# F-22 dogfight difficulty ramp — audit and proposal

Date: 2026-09-25. Audit only. No product code in this change.

The front door is still an Ace in an uprated jet, usually with a wingman, and the easing that was supposed to follow a beating never runs. July production telemetry is the newest evidence in this worktree. A brand-new phone player does not lose a dogfight. They cannot see one.

## What the owner asked, and what the code does

Owner, 2026-09-25: make the game approachable to new players, and give it a difficulty ramp.

The standing doctrine, quoted in `sim.Tests/FightDirectorTests.cs:113-115` and implemented in `sim/Doctrine/PilotSkill.cs:147-164`:

> the first bad guy should always default to really hard and then once he guns your brains out we can make things easier.

`BanditSkillProfile.ForEngagement` returns `PilotSkill.Ace` for every engagement number (`PilotSkill.cs:163-164`). `FightDirector.NextSpawn` reproduces that on a cold start (`FightDirector.cs:134-145`): Ace, uprated mount, formation size 2, `Sparring = true` on engagement 1. Easing is supposed to happen after completed losses (`FightDirector.cs:171-178`, `LossStreak >= 2`, plus a one-step move toward the learner band after a single loss because a loss clears the win streak and `NeverEasierAfterAWin` then allows a step down, `FightDirector.cs:351-361`).

That second half needs a finished engagement. `FightDirector.Observe` runs from `SimulationSession` when an engagement report closes (`SimulationSession.cs:6449`). A tab close is not a report. The July tapes already said so: 4 of 86 visitor sorties reached `sortie_finished` (`docs/superpowers/specs/2026-07-30-sparring-partner-first-sortie-design.md:18-19`, `:100-103`). The ladder is evidence-driven for a population that produces no evidence.

`e04cec8` ("Merge: the opening 1v2 sets the player up") did not change the tier. It added `BanditTactic.Present`: two Aces fly a stable line until the player holds a gun position, then they turn (`SparringPartnerTests.cs:7-10`, `ReactiveBandit.cs:175-180`). The design doc that proposed a Novice opening was corrected before implementation: the opening stays Ace, and the first fight is a 1v2 (`2026-07-30-sparring-partner-first-sortie-design.md:7-25`). Present is a few seconds of parade in front of the same fight.

## Telemetry

`bin/telemetry-report` reads the operator token from the macOS keychain and fetches the private store (`bin/telemetry-report:16-40`). It caches under `tmp/telemetry-cache/` (`tools/telemetry/report.py:22`, `:38`). This worktree has no `tmp/telemetry-cache/`. Nothing newer than the July 2026 export cited below was available locally. No external fetch was made.

The seven-day funnel in that spec, from `bin/telemetry-report --deep` (`2026-07-30-sparring-partner-first-sortie-design.md:42-51`):

| Stage | Sessions |
|---|---|
| loaded | 99 |
| started a sortie | 67 |
| fired | 21 |
| hit | 1 |
| kill | 0 |

Twelve days: 86 visitor sorties, 7,535 ranged rounds, 2 hits, 0 kills. Median firing range 3,716 m. About 69% of rounds fired beyond 2 km. `lead_valid` false on 68% of trigger pulls. 49% of sorties got inside 1 km; 21% inside 300 m; closest approach 16 m. Only 6% reached the gun window; 1% held a firing solution. Opponent on deduped sorties: Ace 59/86 (69%), Novice 12, unrecorded 15; Su-35S on 59; coordination `BRACKET` or `PRESSURE` on 36 of 43 recorded roles. 71% of the cited sessions were phones; Threads in-app browser was the bulk of referrals (spec: 80 of 150 sessions, 73 referrals from `l.threads.com`; the owner’s 2026-09-25 brief says 71% mobile).

`docs/STATUS.md` (updated 2026-09-10) still describes the live front door as an open-ended F-22 fight, Kestrel Gorge as the first sortie, and the presenting Ace as the Build 350/351 behaviour. It does not claim a later visitor funnel. Treat July as the last measured stranger population.

## Levers that exist

### Skill profiles

`PilotSkill`: Novice, Competent, Veteran, Ace, Machine (`PilotSkill.cs:5`).

`BanditSkillProfile.For` (`PilotSkill.cs:79-135`):

| Tier | Max acquire G | Lookahead | Fire cone | Lead cone | Body-gate fire | Other |
|---|---|---|---|---|---|---|
| Novice | 2.40 | 0 ticks | 3.0° | 0.25° | yes | no overshoot force, no disengage, 1 doctrine |
| Competent | 4.80 | 100 (~0.83 s) | 3.5° | 0.40° | yes | boom-and-zoom low block |
| Veteran | 5.50 | 90 | 5.0° | 0.45° | yes | disengages, hunts the low block, 2 doctrines |
| Ace | 9.00 | 150 (~1.25 s) | 3.5° | 1.25° | **no** | finisher authority pinned at 5.5 G, `FineTrackMaxG` 99 so the finisher stays on |
| Machine | 15.0 | 180 | 3.0° | 0.45° | yes | energy-retention weight 1.30 |

The Ace comment is the measured conversion change: body-gate fire was 147 rounds / 0 hits; solution fire was 39 rounds / 11 hits (`PilotSkill.cs:97-110`). Veteran’s wide cone is deliberate tracer pressure (`PilotSkill.cs:69-72`). Novice at 2.40 G with no lookahead could not turn with an 8–12 G player and never fired; that is why the old ramp was thrown out (`PilotSkill.cs:152-157`, `FightDirectorTests.cs:113-116`).

`Boss()` is an Ace with a 1.8° cone and `IsBoss` (`PilotSkill.cs:141-142`). The director serves it, or the Machine, only after a win streak of 3, 240 s unbeaten, overall band Sharp, and a boss cooldown (`FightDirector.cs:41-44`, `:276-281`, `:152-166`). Cold start never reaches that.

Doctrine index is `(engagementNumber - 1) % DoctrineCount` (`FightDirector.cs:283-289`). It biases the opener for about 2 s (`ReactiveBandit.cs:2548-2563`): index 0 is unbiased, 1 favours a one-circle/energy opener, 2 a high yo-yo. It is not the BRACKET/PRESSURE axis.

### Fight director

Phases: Calm, Build, Boss, Release (`FightDirector.cs:3`).

Cold `NextSpawn` (`FightDirector.cs:133-145`): `ForEngagement` → Ace, then `Sparring` and `FormationSize = 2` when `engagementNumber <= 1`.

After any observation (`FightDirector.cs:169-190`):

- Two straight losses: one step toward one tier below the learner’s overall band.
- Three untouched walkovers (`HitsTaken == 0` and `SolutionSecondsConceded <= 0.75`): press to Ace.
- Two walkovers: commit to the band without stepping down after a win.
- Otherwise one step toward the band, and a win never steps down (`NeverEasierAfterAWin`).

Formation size stays 2 until `LossStreak >= 2`, except boss and Machine, which are duels (`FightDirector.cs:308-316`). Mount: Novice and Machine stay baseline; Veteran and above start uprated (Su-35S); two walkovers push the mount up; two losses pull it down (`FightDirector.cs:325-335`, `Beats.cs:600-604`). The F-22 surrogate sustains more G than the Su-27S; the Su-35S is the axis that can stay with a ~9 G pilot (`FightDirector.cs:6-13`).

`LearnerModel` keeps four ordinary engagements and three bands: Gunnery (fraction of shots in the gun window, plus ammo economy on a win), Energy (minimum KIAS, overshoots only against Veteran+), Defensive BFM (time spent in the bandit’s solution, hits taken) (`LearnerModel.cs:27-41`, `:131-209`, `EngagementReport.cs:13-28`). Cold bands are all `Steady`, which maps to Competent (`LearnerModel.cs:100-103`, `FightDirector.cs:338-343`). Boss outcomes move streaks and do not move the bands (`LearnerModel.cs:60-62`). A handoff is not learning evidence (`EngagementReport.cs:8-10`, `:27-28`).

`ExportState` / `TryImportState` is a `v1|…` blob (`FightDirector.cs:202-261`). The browser stores it at `guns-only.fight-director.v1` and restores it after `StartBeat`, because `StartBeat` resets the director (`web/wwwroot/app.js:2063-2081`, `:5221-5233`). A corrupt blob is rejected and the sortie opens cold — which means Ace. The blob does not store hits, kills, or time-to-first-hit. It stores band enums, streaks, phase, and last opponent. A visitor who never finishes a fight never writes a useful blob, and the next launch is Ace again. Threads in-app storage is a poor place to keep the only copy of “this person can fly”; absence must not mean Ace.

### Tactics: Present, then BRACKET / PRESSURE

`BanditTactic`: Acquire, Defend, Energy, Return, Present (`ReactiveBandit.cs:180`).

Present (`ReactiveBandit.cs:712-719`, `:1857-1888`):

- Spawn slant range 1,000 m when `presenting` is true; otherwise about 2,200–2,860 m (`ReactiveBandit.cs:423`).
- Does not shoot (`SparringPartnerTests.cs:111-121`).
- Flies a 15° bank, level turn, not reacting to the player.
- Leaves Present after 2.0 s inside 900 m and 12°, or after 4.0 s inside 1,500 m with no gun solution. One-way.
- `EndPresentation` exists so a wingman stops parading when its partner is already fighting (`ReactiveBandit.cs:1852-1855`).

The 4 s proximity latch was added because visitors found the bandit and never held the 12° funnel, so a tracking-only Present lasted the whole sortie and the Ace never fired (`ReactiveBandit.cs:713-715`, `SparringPartnerTests.cs:58-61`). That latch is why Present does not teach gunnery. It ends the lesson when the player is merely nearby.

`FormationTacticalRole`: Independent, Pressure, Bracket, Extend (`FormationCoordination.cs:8-13`). `EnemyPairCoordinator` assigns one pressure fighter and one support fighter on a fixed radio delay (`FormationCoordination.cs:39-47`). Bracket scores lateral separation; Pressure is ordinary pursuit (`ReactiveBandit.cs:2536-2544`). This is the coordinated pincer in the July tapes. It is on for every cold opening because formation size is 2.

First-run valley forces Present as well: `presenting: spec?.Sparring == true || FirstRunValley is not null` (`Beats.cs:635`).

### Gunnery pitch assist

F-22 surrogate, `FlightModel.cs:932-948`: inside 14° and 1,050 m, pitch rate up to 0.30 rad/s, at most 3.5 G of correction, gain 2.4 /s. Lateral roll and yaw gains are 0. The comment is explicit: it magnetises the nose; it does not create hits. An earlier hidden roll assist fought the pilot’s bank (tape 415) and was removed.

`ApplyGunneryPitchAssist` (`SimulationSession.cs:7053-7101`) runs whenever the player’s gun is enabled, an opponent is alive, and the pilot is not in approach, high-alpha recovery, or an interlock. Touch widens the capture angle by 1.35 and adds 1 G, and scales lateral gain by 1.25 — which is a no-op on the F-22 because lateral gain is already 0. It yields to a deliberate unload or a maximum pull (`GunneryPitchAssist.cs:120-133`). It is not gated on skill, first sortie, or phone. Every F-22 fight gets it, including a pilot who is already killing Aces.

The funnel the assist and Present both key off is a presentation limit, not the round’s life. `gun_funnel.js:5-9` refuses to draw past `EFFECTIVE_CEILING_M = 900` because wingspan ranging stops being trustworthy. `CameraSolver.GunWindow` is range < 800 m and angle-off < 12° (`CameraSolver.cs:7-8`). The M61A2 surrogate round lives 2.0 s at 1,030 m/s, so 2,060 m (`GunProfile.cs:31-36`). The HUD’s “you can shoot” picture starts 1,160 m inside the distance the round can still be in the air, and it is invisible at the range people actually fire.

### Hold-fire through the first pass

`VisualMergeEvaluationConfig.HoldFireThroughFirstPass` defaults to true (`VisualMergeEvaluation.cs:17`). The front-door beat sets it false (`Beats.cs:1557-1559`): guns free, because a 2v1 opening pass is already a fight. The evaluator still scores the pass; it does not inhibit the trigger. This is not a teaching hold. It is off.

### Auto-GCAS

The F-22 capability is `AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate`, `Available: true` (`Beats.cs:143-148`, `AutoGcas.cs:101-103`). It is a last-instant terrain fly-up. As of 2026-07-24 it does not read pilot physiology, because coupling it to “the pilot is flying” caused false fly-ups in the fight (`AutoGcas.cs:116-119`). It is safety, not a difficulty rung. Leave it on at every rung.

### Guided first sortie

`guns-only.first-run-valley` (`web/wwwroot/render/onboarding/first_run_valley.js:6-44`). Pending when the key is absent. `?firstRun=1` forces it. `?menu=1` or any program query other than `first-merge` skips it.

Ready card (`app.js:5023-5040`): kicker “Kestrel Gorge · guided first sortie”, title “Enter the valley”. Copy: stay low, follow the valley north, at the pop-out Fire launches two heat-seeking missiles one at a time, then the same control is the gun, splash the pair, recover. Phone hint: left stick throttle/yaw, right stick pitch/roll.

Kernel (`FirstRunValleyRuntime.cs:12-48`): player starts at north −19,200 m, pop-out gate −1,200 m, route 420 KCAS, altitude 310 m, two AIM-9s. `WeaponsCold` and `ParkOpponents` until the player crosses the gate. About 18 km of valley before a fight exists. At 420 kt that is on the order of 80–90 seconds if they fly the route and do not hit a wall. Chevron ladder is world-space and only while weapons are cold (`guidance_path.js` first-run ingress). `docs/STATUS.md:52-62` records the same contract: Follow valley → Fox Two → track → Fox Two → guns / RTB, and a Replay valley action for returning pilots.

After pop-out the parked Aces unpark into Present, then into the 1v2. The valley teaches “follow a line in a canyon.” It does not teach range, lead, or that the round dies.

### Practice

Three exercises (`practice.js:1-14`), reached only when a practice exercise is selected (`app.js:4755-4756`, `:5200-5204`). Valley (3 min, stop at the gate), controlled gun pass (unarmed scripted target 550 m ahead, two physical hits, `PracticeBeats.cs:15-31`), runway recovery. Practice does not award sortie credit and does not feed `FightDirector`. It is a side door. The Threads visitor who taps the front-door Fly control does not see it.

### What is persisted, and what it does not do

| Store | Key | Drives the next opponent? |
|---|---|---|
| Fight director | `guns-only.fight-director.v1` | Yes, but only after a completed engagement was observed. Cold and corrupt both open at Ace. |
| First-run flag | `guns-only.first-run-valley` | Once `seen`, the valley card is gone. The next boot is the Ace gym. |
| Logbook | `guns-only.pilot-logbook.v1` | No. Records rounds, hits, kills, duration, valley cleared (`pilot_logbook.js:1-28`, `:101-106`). Explicitly no aircraft modifiers. |
| Settings | player settings | Bindings and picture. Not skill. |

There is no persisted time-to-first-hit, no hit streak, and no “this device has killed something” bit that `NextSpawn` reads.

### Telemetry events available without a new store

Lifecycle, opt-in: `sortie_staged` (includes `first_run_valley`), `sortie_started`, `sortie_ended`, `sortie_finished` (`app.js:2260`, `:2410`, `:5216`). `sortie_finished` is the edge the director’s population never hits. Sampled snapshots already carry the fields the July report used: range, `lead_valid`, rounds, bandit skill, mount, coordination role. `EngagementReport` already has duration, hits taken, shots, shots in window, solution seconds, outcome (`EngagementReport.cs:13-25`). A ramp can be scored from those without a new telemetry schema. Hosted diagnostics stay opt-in (`README.md:64-66`). The ramp itself has to live in local kernel state, not in the private store.

## What a new phone player does in the first three minutes

1. They arrive from a social in-app browser onto the F-22 front door. Thirty-two of 99 never start (`2026-07-30` spec: 99 loaded, 67 started).
2. If `guns-only.first-run-valley` is empty, the card is “Enter the valley,” not “here is a dogfight.” They get a canyon, a chevron path, weapons cold, opponents parked. The Fire control will later mean two different things. That is the first minute.
3. If they pop out, two missiles are the next mandated action, then a gun fight against a pair that is presenting only until 4 s inside 1.5 km. The contact at a typical firing range is about one pixel (`ReactiveBandit.cs:418-422`). The gun funnel is not drawn. The bracket and the range number are. They shoot. The round is already dead.
4. If they close the valley or are a returning browser with the valley key set, step 2 is skipped. They are in the endless Ace 1v2 immediately. Present still ends on proximity. BRACKET/PRESSURE then runs.
5. They do not die in a way the director can see. They leave. Four finished sorties in 86. Next visit: Ace again. Pitch assist is already on and does not help at 3.7 km, because its gate is 1,050 m. Auto-GCAS may save them from the canyon floor. It will not put them on a target.

The failure is visual and temporal, then doctrinal. They spend the ammunition before the aircraft is big enough to track, and the opponent that would ease up never receives a loss.

## Proposal

Persist demonstrated performance on the device. No difficulty menu. No “new pilot?” gate. The cold opening stops being Ace. Ace, the uprated jet, and the pair are rungs you reach by hitting and killing, and you fall off them by dying without hitting.

Do not put Novice back on this ladder. 2.40 G and zero lookahead was a non-event (`PilotSkill.cs:152-157`). Competent is the floor: it can turn, it has lookahead, and it still fires on the body gate, so it throws tracers instead of waiting for a 1.25° solution.

Ballistics, hit radius, and Auto-GCAS do not change. Assistance may change who moves a control. It does not change where the round goes.

### Skill ladder

Rungs are spawn-boundary decisions, same contract as today: `NextSpawn` reads stored history, never counter-picks mid-fight (`FightDirector.cs:36-39`). In-fight withdrawal of Present stays inside `ReactiveBandit`.

| Rung | When | Skill | Mount | Number | Tactic on spawn | Pitch assist |
|---|---|---|---|---|---|---|
| 0 Unproven | No stored hit and no stored kill | Competent | Baseline Su-27S | 1 | Present. Graduate only on 2 s inside 900 m / 12°. **No 4 s proximity latch.** | Full F-22 law (3.5 G, 14°, 1,050 m). Touch keeps the existing 1.35× / +1 G pitch widening. |
| 1 Has a hit | At least one physical gun hit, no kill | Veteran | Baseline | 1 | Acquire. No Present. | Gain and max correction halved. Capture angle unchanged. |
| 2 Has a kill | One kill, no walkover pair yet | Ace | Baseline | 1 | Acquire. `FiresOnBodyGate` stays false. | Off. |
| 3 Earned pair | Two kills, or one kill plus a walkover (0 hits taken, solution seconds ≤ 0.75) | Ace | Uprated Su-35S | 2 | Acquire, then live BRACKET / PRESSURE | Off. |
| Boss | Existing triggers only, and only from rung 3 | Ace `Boss()` or Machine | as today | 1 | as today | Off. |

Rung 3 is today’s cold opening, moved to the top. `ForEngagement` stops being “always Ace.” It becomes unused for the front door, or it becomes `ForRung`. The tests named `ForEngagementOpensAtTheCeilingRatherThanRampingUp` and `TheOpeningFightIsTheHardestAndUntouchedWinsHoldItThere` are assertions of the doctrine this proposal retires. Rewrite them. Do not loosen them and leave the old names.

Present on rung 0 keeps the 1,000 m spawn (`ReactiveBandit.cs:423`). One ship, so there is no coordinator and no BRACKET. The 4 s / 1,500 m latch is removed on this rung only: proximity was how the Ace started killing people who had not yet seen a gunsight. A player who never tracks stays on a non-firing lead. That is the lesson. A player who tracks for 2 s inside the funnel has demonstrated the motor skill; Present ends and the Competent profile fights.

### Assists, and which ones are honest

Honest on a flat screen means the cue is a fact the sim already knows, shown where the eye can use it. A crutch is the sim flying or hitting for the player.

- **Gun funnel inside 900 m.** Honest. Wingspan ranging past that is a lie (`gun_funnel.js:5-9`). Do not stretch it to 2 km.
- **Round life at 2,060 m.** The missing fact. Today the contact bracket and the range numeral read as “shoot this” at 3.7 km, where `lead_valid` is already false. Keep the contact. Do not draw gun-solution symbology, and do not accept a “solution” reading, when range is greater than `MuzzleVelocityMps * MaximumFlightSeconds`. Tracers already die in the air; the picture should not invite the trigger past that point. That is the funnel fix. It is not a new HUD lecture.
- **Pitch assist.** A limited crutch, and the right kind for a thumb stick: the F-22 law adds pitch only, yields when the pilot unloads or pulls to the stop, and does not move the round (`FlightModel.cs:932-937`, `GunneryPitchAssist.cs:120-133`). Lateral assist stays at 0. It fades on the ladder above, by demonstrated hits, not by a timer. Keyboard and touch use the same fade. Touch may keep the existing wider capture and extra G through rung 1, because the device cannot hold a 14° gate the way arrow keys can (`SimulationSession.cs:7069-7081`). It is off at rung 2 for both.
- **Present.** Honest if it is a lead you can see, and a crutch if it ends because you flew past. Rung 0 uses the tracking hold only.
- **Auto-GCAS.** Safety. On at every rung.
- **Hold-fire through the first pass.** Leave it off. A banned trigger is a rule card, not a picture.
- **Kestrel valley and the two AIM-9s.** Keep for a first visit as a flight-path lesson. Do not make “splash the pair” the sentence on the card until rung 3. The card can say: follow the valley, then join the aircraft ahead and hit it with the gun. Missiles can stay in the beat as a second action after the first gun hit, or stay as they are for a later pass. They are not the difficulty ramp. They are a second control identity on the same button (`first_run_valley.js:46-63`) in the minute the player is still learning the sticks.
- **Practice gun pass.** Leave it. Do not route the front door through it. The ramp is the front door.

### Promotion and demotion

All of these are kernel facts already on `EngagementReport`, plus one new counter: time from weapons-hot (or from Present spawn, if there is no valley) to the first `GunKill` hit. Store that time. Do not show a grade.

Promote at the next `NextSpawn` only:

- First hit → rung 1, even if that fight is still going when they die afterwards. The hit is the evidence. Death in the same fight does not erase it.
- First kill → rung 2.
- Second kill, or a walkover as already defined (`FightDirector.cs:95-97`) while on rung 2 or 3 → rung 3.
- Boss rules unchanged, and only while the stored rung is 3.

Demote at the next spawn:

- Two completed defeats in a row with zero hits in those two fights → one rung down, not to the bottom, and never below 0.
- A defeat that includes a hit does not demote. They found the airplane. The opponent can stay.
- Abandoning the page is not a defeat and not a win. Next launch uses the stored rung. If nothing is stored, rung 0.

A single finished loss no longer has to crawl Ace → Veteran → Competent across fights the visitor never plays. The cold start is already the easy fight.

### How a returning pilot skips ahead

Extend the persisted blob (new version, reject unknown versions the way `v1` is rejected, `FightDirector.cs:227-230`). Fields that `NextSpawn` needs, and nothing else:

- rung (0–3)
- kills
- hits
- consecutive hitless defeats
- time-to-first-hit seconds, or empty
- the existing boss/release fields if a rung-3 pilot had them

Restore before the opening spawn, including `StartFirstRunValley`, which today does not call `restoreDirectorState` (`app.js:5211-5233` restores only on the non-valley `StartBeat` path). A pilot who has kills and then replays the valley must not be handed rung 0 underneath the canyon.

Skip rule, so a skilled player is not sentenced to a Competent lead for an hour:

- Stored kill ≥ 1 → open at rung 2 (Ace, 1v1, baseline).
- Stored rung 3 → open at rung 3.
- No storage, or storage that fails to parse → rung 0. Never Ace.

In the same sortie, a kill promotes the *next* spawn immediately. They do not need to reload. Two clean kills in one session are enough to see the pair. That is the skip. There is still no menu.

Logbook stays a record. It must not become a second writer of the rung. One blob, one reader.

### What this does to the always-Ace doctrine

Retire it for the cold front door.

The instruction assumed a pilot who stays long enough to be killed, after which the game relents. The measured population does not stay, does not get killed in a logged engagement, and fires outside the round. “Really hard” is not what they experience. They experience a dot, a bracket, and a gun that seems broken. The Ace’s actual lethality (solution fire, 9 G, Su-35S, a wingman on BRACKET) never gets to be the lesson, because the picture fails first.

Ace remains in the game. It is the rung you earn by killing, and the pair is the rung you earn by doing it twice or by not being threatened while you do it. A player who can already fight still meets an Ace on the second kill of the session, or on the first spawn of the next session. The humbling fight moves from “minute one, invisible” to “after you have hit something and can see the airplane.”

### Variant that keeps the hard first fight

If the opening must still be an Ace, do not also open 1v2, uprated, BRACKET, and guns-free at 2 km. The variant:

1. Rung 0 is still one ship at 1,000 m on Present, but the profile underneath is Ace, baseline mount, formation size 1. No proximity latch. They see an aircraft that is holding still.
2. Present ends only on the 2 s funnel hold, or on the first trigger pull inside 2,060 m. Then that Ace fights. One jet. That is the humbling fight, and it is visible.
3. If the player dies, the next spawn is Competent, 1v1, Present-with-tracking-hold, as in rung 0 of the main proposal. The owner’s sentence is implemented literally: hard first, then easier after the beating.
4. If they close the tab without a finished engagement, the next visit repeats step 1. It does not skip to the pair. The beating did not happen.
5. A stored kill still skips to rung 2 on the next launch, so a returning pilot is not humbled every Tuesday.

This variant keeps “the first bad guy is an Ace.” It drops the parts that made the first bad guy impossible to see: the second jet, the Su-35S, and the 4 s latch that turns the parade into a murder. The main proposal is the one that matches “approachable, then a ramp.” The variant is the one that matches the July 2026 instruction if that instruction still outranks the funnel. Pick one. Shipping both as flags is a difficulty menu by another name.

## Test plan

Kernel tests, deterministic, no renderer. New fixture file. Do not edit `Beats.CarrierApproach` or any shared beat to make a point; build the rung cases on `FightDirector` and a scripted `ReactiveBandit` the way `SparringPartnerTests` already does.

1. Empty director, `NextSpawn(1)` → Competent, baseline, formation 1, `Sparring` true. Not Ace. Not uprated. Not a pair.
2. Same history bytes → same spawn, twice.
3. One `EngagementReport` with a hit, outcome defeat → next spawn Veteran, formation 1, not sparring.
4. One report with a kill → next spawn Ace, baseline, formation 1.
5. Second kill, or a walkover on that Ace → next spawn Ace, uprated, formation 2.
6. Two hitless defeats → one rung down. A defeat that recorded a hit does not demote.
7. Page-abandon: no `Observe` → exported state unchanged → next import still rung 0. Absence is not Ace and not a loss.
8. Import a blob with `kills >= 1` → opening spawn is rung 2 even when `engagementNumber` is 1.
9. Malformed blob → rung 0, state unchanged on the failed import (today’s `TryImportState` contract).
10. Present: 2 s inside 900 m / 12° clears it. 10 s at 1,200 m does not, on rung 0. One-way still holds.
11. Scripted shooter at 3,700 m records zero hits (round life). Scripted shooter that closes to 500 m and stays inside the lead cone records a hit and the following `NextSpawn` has moved one rung. Headless. No browser.
12. Auto-GCAS availability on the F-22 beat is unchanged at rung 0 and rung 3.
13. Pitch-assist max correction G is the F-22 value at rung 0, half at rung 1, and the assist reports inactive at rung 2. Ballistic hit tests still fail when the nose is on the target and the lead is not: the assist does not mint hits.

Rewrite `ForEngagementOpensAtTheCeilingRatherThanRampingUp` and `TheOpeningFightIsTheHardestAndUntouchedWinsHoldItThere` in the same change as the director, as replacements that assert the new cold open and the earned-Ace path. Leaving them green by special-casing `engagementNumber >= 1 → Ace` means the ramp did not ship.

After it ships, the acceptance instrument is still `bin/telemetry-report --deep` on opted-in visitors: fired-inside-round-life up, hits above 1, kills above 0, and the cold `bandit_skill` on a no-history session no longer ACE. That run needs the keychain and the network. It is not part of this audit.

## Assumptions

- July 2026 is still the right population. There is no local cache to contradict it. If a later export exists only in the hosted store, this proposal can be wrong about the rate and still right about the mechanism: cold `NextSpawn` is Ace until something calls `Observe`.
- Competent will actually fire and be visible at 1,000 m. It is not Novice. It has not been measured against a phone thumb in this audit.
- Threads in-app `localStorage` often dies with the webview. The fail-open is rung 0, so a wiped store is a short lesson, not a wall. A skilled pilot who loses the blob repeats rung 0 once, then skips on the next kill. That is accepted.
- The valley stays the first-visit route. This proposal does not retune canyon geometry, missile count, or the recovery pattern.
- Owner chooses the main ladder or the Ace-first variant before anyone edits `PilotSkill.ForEngagement`.
