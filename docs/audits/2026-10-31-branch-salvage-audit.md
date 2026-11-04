# Branch, worktree and stash salvage audit, 2026-10-31

Read-only. main = 55285d61. Local branches: 97 (task brief said ~246; actual count is 97). Worktrees: 45. Stashes: 27.

Counts: fully merged into main 52; unmerged-live 41; unmerged merged-equivalent (cherry all -) 2; unmerged-unknown 2; worktrees with dirty files 10.

Ahead/behind is relative to main (ahead = commits only on the branch). Remote column shows upstream and its track state; blank = no remote-tracking branch. Merged = reachable from main. Cherry = `git cherry main BRANCH` (+ unique patches / - patch already on main).

## 1. All local branches

| Branch | Tip | Date | Author | Ahead/Behind main | Merged | Remote (track) | Worktree |
|---|---|---|---|---|---|---|---|
| feature/rc-adventure | 0a405db3 | 2026-10-31 | Ian Todd | 171/0 | no | - | .worktrees/rc-adventure |
| feature/rc-pipeline | 88cddab7 | 2026-10-31 | Ian Todd | 172/0 | no | - | .worktrees/rc-pipeline |
| feature/rc-dark-world | cd86b488 | 2026-10-31 | Ian Todd | 169/0 | no | - | .worktrees/rc-dark-world |
| feature/rc-next | a981342a | 2026-10-31 | Ian Todd | 163/0 | no | - | .worktrees/rc-next |
| feature/rc-claude-polish | e779e625 | 2026-10-30 | Ian Todd | 95/0 | no | origin/feature/rc-claude-polish (ahead 8) | .worktrees/rc-claude-polish |
| rc/nyfill | 55337417 | 2026-10-29 | Ian Todd | 85/0 | no | - | - |
| rc/ny | dab8bfe8 | 2026-10-29 | Ian Todd | 82/0 | no | - | - |
| rc/venice | 3d69361c | 2026-10-29 | Ian Todd | 79/0 | no | - | - |
| rc/polish | c02fe76e | 2026-10-29 | Ian Todd | 73/0 | no | - | - |
| rc/plazafill | 1cebc496 | 2026-10-29 | Ian Todd | 69/0 | no | - | - |
| rc/carscale | b8738147 | 2026-10-29 | Ian Todd | 66/0 | no | - | - |
| rc/philly | c1e3f686 | 2026-10-29 | Ian Todd | 62/0 | no | - | .worktrees/rc-philly |
| rc/marseille | 0578b9cb | 2026-10-28 | Ian Todd | 59/0 | no | - | .worktrees/rc-marseille |
| rc/skatestreet | 46006fc6 | 2026-10-28 | Ian Todd | 50/0 | no | - | .worktrees/rc-skatestreet |
| rc/grinds | f100659d | 2026-10-28 | Ian Todd | 48/0 | no | - | .worktrees/rc-grinds |
| feature/rc-location-jumps | 876527ea | 2026-10-26 | Ian Todd | 26/0 | no | origin/feature/rc-location-jumps (in sync) | - |
| feature/rc-world-finish | 044ff2b9 | 2026-10-26 | Ian Todd | 23/0 | no | origin/feature/rc-world-finish (in sync) | - |
| feature/rc-route-frontages | 45aa558f | 2026-10-26 | Ian Todd | 21/0 | no | origin/feature/rc-route-frontages (in sync) | - |
| feature/rc-outer-roads | e365d09b | 2026-10-26 | Ian Todd | 19/0 | no | origin/feature/rc-outer-roads (in sync) | - |
| feature/rc-corridor-fidelity | 7a27954b | 2026-10-26 | Ian Todd | 16/0 | no | origin/feature/rc-corridor-fidelity (in sync) | - |
| feature/rc-world-surface-polish | 0cf6cc69 | 2026-10-26 | Ian Todd | 12/0 | no | origin/feature/rc-world-surface-polish (in sync) | - |
| feature/rc-touch-quarter-return | 0255568b | 2026-10-25 | Ian Todd | 8/0 | no | origin/feature/rc-touch-quarter-return (in sync) | .worktrees/residential-rebuild |
| feature/park-reference-topology | 75bc130d | 2026-10-25 | Ian Todd | 6/0 | no | origin/feature/park-reference-topology (in sync) | - |
| feature/residential-rebuild | 4b2144f4 | 2026-10-25 | Ian Todd | 4/0 | no | origin/feature/residential-rebuild (in sync) | - |
| feature/rc-blacksite | d6cd617f | 2026-10-23 | Ian Todd | 9/52 | no | - | - |
| codex/rc-analytics | 182950f3 | 2026-10-23 | Ian Todd | 8/52 | no | - | .worktrees/codex-rc-analytics |
| codex/rc-mp-recovery | d89147cb | 2026-10-23 | Ian Todd | 8/52 | no | - | .worktrees/codex-rc-mp-recovery |
| playtest/lab-rtb | 5701b143 | 2026-10-16 | Ian Todd | 11/171 | no | origin/playtest/lab-rtb (in sync) | .worktrees/lab-rtb |
| pathfinders/lab | 17205227 | 2026-10-16 | Ian Todd | 16/177 | no | origin/pathfinders/lab (in sync) | .worktrees/pf-lab |
| rapier/pathfinders | ac12625c | 2026-10-16 | Ian Todd | 11/181 | no | origin/rapier/pathfinders (in sync) | .worktrees/rapier |
| pathfinders-dawn | d43fa168 | 2026-10-16 | Ian Todd | 11/181 | no | - | ../../.cursor/worktrees/guns-only/pathfinders-dawn |
| visual/pass-1 | a1ebb442 | 2026-10-15 | Ian Todd | 8/193 | no | origin/main (ahead 8, behind 220) | .worktrees/visual |
| visual/ground-try | d0216111 | 2026-10-15 | Ian Todd | 6/193 | no | - | - |
| visual-fog | fc93962f | 2026-10-15 | Ian Todd | 4/193 | no | - | ../../.cursor/worktrees/guns-only/visual-fog |
| release/build-379 | 378737d0 | 2026-10-14 | Ian Todd | 54/217 | no | origin/release/build-379 (in sync) | .worktrees/rel-379 |
| imp/r1-recovery | e1d4d9a4 | 2026-10-14 | Ian Todd | 59/217 | no | origin/imp/r1-recovery (in sync) | .worktrees/imp-r1-recovery |
| imp/c13-distant-runway | 70c074dc | 2026-10-14 | Ian Todd | 53/217 | no | origin/imp/c13-distant-runway (in sync) | .worktrees/imp-c13-distant-runway |
| imp/c12-ai-gunnery | 2faef013 | 2026-10-14 | Ian Todd | 14/218 | no | - | .worktrees/imp-c12-ai-gunnery |
| imp/a8-keyboard-core | d3371b4a | 2026-10-14 | Ian Todd | 23/218 | no | - | .worktrees/imp-a8-keyboard-core |
| imp/a7-bandit-fun | 270847be | 2026-10-14 | Ian Todd | 11/218 | no | - | .worktrees/imp-a7-bandit-fun |
| imp/c11-hit-autoaim | 0e8237a8 | 2026-10-14 | Ian Todd | 13/218 | no | - | .worktrees/imp-c11-hit-autoaim |
| imp/c2-bandit-reengage | ae965c1b | 2026-10-13 | Ian Todd | 6/299 | no | origin/main (ahead 6, behind 326) | .worktrees/imp-c2-bandit-reengage |
| imp/c10-hit-geometry | 67279bd5 | 2026-10-13 | Ian Todd | 3/271 | no | origin/main (ahead 3, behind 298) | .worktrees/imp-c10-hit-geometry |
| visual-ground | bcc82a11 | 2026-10-15 | Ian Todd | 4/193 | no | - | ../../.cursor/worktrees/guns-only/visual-ground |
| feedback/report | 4b419ec8 | 2026-10-15 | Ian Todd | 4/193 | no | origin/main (ahead 4, behind 220) | .worktrees/feedback |
| main | 55285d61 | 2026-10-24 | Ian | 0/0 | yes | origin/main (behind 27) | - |
| fix/deploy-headroom | 2db75bcd | 2026-10-24 | Ian Todd | 0/1 | yes | origin/fix/deploy-headroom (in sync) | . |
| fix/flight-frame-hitch | 0ce6cf62 | 2026-10-24 | Ian Todd | 0/3 | yes | origin/fix/flight-frame-hitch (in sync) | - |
| release/saucer-residential-hills | cc270dab | 2026-10-24 | Ian Todd | 0/6 | yes | origin/release/saucer-residential-hills (in sync) | - |
| fix/rc-independent-cache | 0bdfe3fb | 2026-10-23 | Ian Todd | 0/45 | yes | origin/fix/rc-independent-cache (in sync) | - |
| release/396 | a72518c7 | 2026-10-22 | Ian Todd | 0/47 | yes | origin/release/396 (in sync) | - |
| release/395 | 353ac1a7 | 2026-10-22 | Ian Todd | 0/50 | yes | origin/release/395 (in sync) | - |
| release/393 | 86fe9c38 | 2026-10-22 | Ian Todd | 0/59 | yes | origin/release/393 (in sync) | - |
| release/392 | 1d21e5be | 2026-10-22 | Ian Todd | 0/66 | yes | origin/release/392 (in sync) | - |
| release/391 | 5db97dd6 | 2026-10-22 | Ian Todd | 0/83 | yes | origin/release/391 (in sync) | - |
| release/390 | ec528831 | 2026-10-22 | Ian Todd | 0/90 | yes | origin/release/390 (in sync) | - |
| release/389 | 555c8e42 | 2026-10-21 | Ian Todd | 0/108 | yes | origin/release/389 (in sync) | - |
| release/388 | 4f0edf1e | 2026-10-21 | Ian Todd | 0/111 | yes | origin/release/388 (in sync) | - |
| release/387 | f491cee4 | 2026-10-21 | Ian Todd | 0/119 | yes | origin/release/387 (in sync) | - |
| release/386 | bbac065d | 2026-10-16 | Ian Todd | 0/158 | yes | origin/release/386 (in sync) | - |
| release/384 | e1264a80 | 2026-10-16 | Ian Todd | 0/172 | yes | origin/release/384 (in sync) | .worktrees/release-384 |
| fun/rtb-compress | c691c07c | 2026-10-16 | Ian Todd | 0/180 | yes | origin/main (behind 207) | - |
| playtest/lab | 7ee71191 | 2026-10-16 | Ian Todd | 0/177 | yes | origin/main (behind 204) | - |
| ux-premium | 65b7d886 | 2026-10-16 | Ian | 0/181 | yes | - | - |
| release/382 | 4e5bbed9 | 2026-10-15 | Ian Todd | 0/182 | yes | origin/release/382 (in sync) | - |
| visual-audit | 242f5b59 | 2026-10-15 | Ian | 0/193 | yes | - | - |
| ux/shell-instrument-pass | 165fad52 | 2026-10-15 | Ian Todd | 0/194 | yes | origin/ux/shell-instrument-pass (in sync) | .worktrees/ux-pass |
| ux-sheet | b4b45bd5 | 2026-10-14 | Ian | 0/198 | yes | - | - |
| ux-variants | b4b45bd5 | 2026-10-14 | Ian | 0/198 | yes | - | - |
| fix/next-batch | a536fa6c | 2026-10-14 | Ian Todd | 0/199 | yes | origin/fix/next-batch (in sync) | .worktrees/next-batch |
| fix/rtb-sa | df8fe036 | 2026-10-14 | Ian Todd | 0/211 | yes | origin/fix/rtb-sa (in sync) | .worktrees/rtb-sa |
| release/build-377 | 132e012e | 2026-10-13 | Ian Todd | 0/218 | yes | origin/release/build-377 (in sync) | .worktrees/rel-377 |
| imp/c8-bfm-ladder | 2dd1a36b | 2026-10-13 | Ian Todd | 0/274 | yes | origin/main (behind 301) | - |
| imp/a6-frame-gate | 2f238121 | 2026-10-13 | Ian Todd | 0/270 | yes | origin/main (behind 297) | .worktrees/imp-a6-frame-gate |
| imp/a5-receipt | 631494c0 | 2026-10-13 | Ian Todd | 0/290 | yes | - | .worktrees/imp-a5-receipt |
| imp/c9-tan-polygon | 6f932f4b | 2026-10-13 | Ian Todd | 0/297 | yes | origin/main (behind 324) | - |
| imp/a3-touch-hud | 55c0025b | 2026-10-13 | Ian Todd | 0/292 | yes | origin/main (behind 319) | - |
| imp/a1-opening | 703085ed | 2026-10-13 | Ian Todd | 0/291 | yes | origin/main (behind 318) | .worktrees/imp-a1-opening |
| release/build-376 | 22284c9a | 2026-10-13 | Ian Todd | 0/272 | yes | origin/release/build-376 (in sync) | - |
| imp/c7-short-final | c958a282 | 2026-10-13 | Ian Todd | 0/297 | yes | origin/main (behind 324) | .worktrees/imp-c7-short-final |
| imp/a2-loop | 712e6786 | 2026-10-13 | Ian Todd | 0/291 | yes | origin/main (behind 318) | .worktrees/imp-a2-loop |
| imp/c1-tier1-bugs | 9dfbc24b | 2026-10-13 | Ian Todd | 0/291 | yes | origin/main (behind 318) | .worktrees/imp-c1-tier1-bugs |
| imp/c3-payload | bec76084 | 2026-10-13 | Ian Todd | 0/297 | yes | origin/main (behind 324) | .worktrees/imp-c3-payload |
| imp/a4-su27-model | 39307f4b | 2026-10-13 | Ian Todd | 0/297 | yes | origin/main (behind 324) | .worktrees/imp-a4-su27-model |
| fix/cold-terrain-performance-gate | 21331d8e | 2026-10-13 | Ian Todd | 0/300 | yes | origin/fix/cold-terrain-performance-gate (in sync) | - |
| fix/offline-resilience-build-374 | 1c808c91 | 2026-10-13 | Ian Todd | 0/304 | yes | origin/fix/offline-resilience-build-374 (in sync) | - |
| fix/frame-gate-deps | 1be2131d | 2026-10-01 | Ian Todd | 0/311 | yes | origin/fix/frame-gate-deps (in sync) | - |
| rung0-cohort | 67877aea | 2026-10-01 | Ian | 0/314 | yes | origin/main (behind 341) | - |
| feat/f22-bandit-pressure | d76e2cb9 | 2026-10-01 | Ian Todd | 0/315 | yes | origin/feat/f22-bandit-pressure (in sync) | - |
| refactor/session-partials | 61d7bdf8 | 2026-10-01 | Ian Todd | 0/333 | yes | origin/refactor/session-partials (behind 8) | - |
| session-split | 61d7bdf8 | 2026-10-01 | Ian Todd | 0/333 | yes | origin/main (behind 360) | - |
| chore/single-source-build-stamp | 403d38d2 | 2026-10-01 | Ian Todd | 0/333 | yes | origin/chore/single-source-build-stamp (behind 15) | - |
| chore/deploy-frame-gate | 16bf724d | 2026-10-01 | Ian Todd | 0/333 | yes | origin/chore/deploy-frame-gate (in sync) | - |
| docs-truth | 9881f17d | 2026-10-01 | Ian Todd | 0/335 | yes | origin/main (behind 362) | - |
| docs/status-truth | 9881f17d | 2026-10-01 | Ian Todd | 0/335 | yes | origin/docs/status-truth (behind 6) | - |
| build-stamp-once | 93947bf8 | 2026-10-01 | Ian Todd | 0/335 | yes | origin/main (behind 362) | - |
| fix/practice-smoke-sim-time | 47a2dcbc | 2026-10-01 | Ian Todd | 0/335 | yes | origin/fix/practice-smoke-sim-time (in sync) | - |

## 2. Unmerged branches with unique commits

Verdict rules: merged-equivalent = cherry shows no + lines; live = worktree attached, tip within 7 days, or named RC trunk candidate; superseded not asserted without evidence (none claimed); otherwise unknown.

| Branch | Cherry | Verdict | Unique commits (first 3) and diff stat main...branch |
|---|---|---|---|
| feature/rc-adventure | +152/-0 | live (RC trunk candidate) | 0a405db3 RC telemetry: a discover event at each first find (place, des / def19c37 RC sound: softer instruments, a little room, and no machine-g / f409e9b8 RC world: you can drive into the high school by the skatepark [309 files changed, 17877 insertions(+), 652 deletions(-)] |
| feature/rc-pipeline | +153/-0 | live (worktree) | 88cddab7 docs: audit progress ledger (31 Oct, morning) / 5f935ea8 RC analytics: places per session and time between discoveries / fd5edb7a RC deploy: write the RC live revision into docs/STATUS.md; ma [320 files changed, 21523 insertions(+), 628 deletions(-)] |
| feature/rc-dark-world | +150/-0 | live (worktree) | cd86b488 RC dark world, first slice: time gates into the past, a ridde / c1bdaca2 Adventure design: the dark world is the past, a toy western / 20ae2eaa RC world: a rocket booster lands on LZ-1 every few minutes [305 files changed, 17973 insertions(+), 621 deletions(-)] |
| feature/rc-next | +144/-0 | live (RC trunk candidate) | a981342a Adventure design: the dark world is the past, a toy western / 8d3dedd5 RC: pumpkin rewards (a pumpkin car at 20, a SIX SEVEN livery  / 370f650d RC controls: F boost shown everywhere it matters; pickups say [293 files changed, 17252 insertions(+), 618 deletions(-)] |
| feature/rc-claude-polish | +76/-0 | live (worktree) | e779e625 RC: Halloween on the base, jets overhead, Space afterburner a / af75a10a Add the Saucer Springs Adventure Playground next to the petti / f2763774 Make RC drifting a Mario Kart drift: hold to slide, charge sp [204 files changed, 9710 insertions(+), 554 deletions(-)] |
| rc/nyfill | +67/-0 | live (tip <=7d) | 55337417 Ground Boardwalk with a safe lagoon shoreline and beach detai / f5d50353 Fill Under the Bridge with linked lines and grounded street c / 258ec629 Merge Under the Bridge: New York-inspired brick banks under a [162 files changed, 7635 insertions(+), 441 deletions(-)] |
| rc/ny | +65/-0 | live (tip <=7d) | dab8bfe8 Ground bridge foundations and prevent emissive atlas bleed / 8f0c4815 Add Under the Bridge RC skate park with brick banks and drive / 9ac6958d Merge Boardwalk: Venice-inspired skate park beside Wavepool B [162 files changed, 7514 insertions(+), 441 deletions(-)] |
| rc/venice | +63/-0 | live (tip <=7d) | 3d69361c polish(rc): keep pit floor and roller shading continuous / 42be8ece fix(rc): give Venice a distinct location and join curved rend / 76d5f27d feat(rc): add Venice-inspired Boardwalk skate park [158 files changed, 7142 insertions(+), 441 deletions(-)] |
| rc/polish | +58/-0 | live (tip <=7d) | c02fe76e Face Bowls entry sign correctly from either approach / 0231f4a7 Conform intro paths to lawn berm and clear turf from bowl wal / 838f81d6 Smooth skate park render transitions and restore authored col [154 files changed, 6695 insertions(+), 441 deletions(-)] |
| rc/plazafill | +55/-0 | live (tip <=7d) | 1cebc496 Leave clear floor and chase-camera room before plaza lines / 2c6f132a Fill Town Plaza with linked skate lines and city frontage / e6dd1635 Merge car scale: true 1:10 buggy track/wheels, matched shells [152 files changed, 6579 insertions(+), 440 deletions(-)] |
| rc/carscale | +53/-0 | live (tip <=7d) | b8738147 Finish scaled garage framing and controlled kerb landings / 9afb0cdb Retune scaled chassis inertia, suspension and race balance / 025da118 Fit RC chassis, shells and chase view to true 1:10 proportion [152 files changed, 6417 insertions(+), 440 deletions(-)] |
| rc/philly | +50/-0 | live (worktree) | c1e3f686 Verify plaza scoring and surface winding; refine signs and dr / da0d8940 Add Town Plaza street skate level with driven gaps and live g / 7180a3bd Merge The Bowls: Marseille-inspired sunken bowl park in a des [144 files changed, 6200 insertions(+), 390 deletions(-)] |
| rc/marseille | +48/-0 | live (worktree) | 0578b9cb Prepare bowl collision before travel and verify graded venue  / 59f3defa Add The Bowls with linked sunken bowls, live coping and drive / 7ae2fe29 Support a graded desert terrain cut for The Bowls [141 files changed, 5891 insertions(+), 390 deletions(-)] |
| rc/skatestreet | +41/-0 | live (worktree) | 46006fc6 Keep Skatestreet signs readable from both sides and correct m / 3ee12c8a Build Skatestreet bowls, street lines and skate challenges / b34cc085 Align Skatestreet art with pure geometry [129 files changed, 4836 insertions(+), 380 deletions(-)] |
| rc/grinds | +39/-0 | live (worktree) | f100659d Add SPECIAL tricks, skate instruments and held touch grabs / 528af307 Add automatic rail grinds and balanced combo manuals to RC sk / e46d4c08 Build the Schoolyard: THPS2 School II on the high school's fi [131 files changed, 4972 insertions(+), 380 deletions(-)] |
| feature/rc-location-jumps | +18/-0 | live (tip <=7d) | 876527ea Separate base location visits from challenge progression / dc19f601 Make world jumps direct and protect mobile game button labels / 3a25deaa Merge pull request #146 from todd866/feature/rc-world-finish [93 files changed, 2531 insertions(+), 319 deletions(-)] |
| feature/rc-world-finish | +16/-0 | live (tip <=7d) | 044ff2b9 Finish base-world rooflines hangar identity and bounded night / e885a501 Merge pull request #145 from todd866/feature/rc-route-frontag / 45aa558f Restore exterior facades and author four route landmarks [87 files changed, 2470 insertions(+), 305 deletions(-)] |
| feature/rc-route-frontages | +15/-0 | live (tip <=7d) | 45aa558f Restore exterior facades and author four route landmarks / a3a2c738 Merge pull request #144 from todd866/feature/rc-outer-roads / e365d09b Keep verge furniture clear of all bends in its source road [84 files changed, 2361 insertions(+), 301 deletions(-)] |
| feature/rc-outer-roads | +14/-0 | live (tip <=7d) | e365d09b Keep verge furniture clear of all bends in its source road / f1ecd44b Grade outer-road verges and add bounded roadside guidance / 20ddb14b Merge pull request #143 from todd866/feature/rc-corridor-fide [82 files changed, 2223 insertions(+), 288 deletions(-)] |
| feature/rc-corridor-fidelity | +12/-0 | live (tip <=7d) | 7a27954b Advance release identity after RC control changes / 5e2e703f Use steering left and spring throttle right for RC touch driv / 45da5dd3 Polish gate BX and school architecture with bounded night lig [80 files changed, 2136 insertions(+), 285 deletions(-)] |
| feature/rc-world-surface-polish | +9/-0 | live (tip <=7d) | 0cf6cc69 Reserve Build 406 for RC world surface runtime changes / 30933744 Include boneyard and browser console in world polish acceptan / 24542e47 Polish RC world surfaces and streamed roadside transitions [75 files changed, 1957 insertions(+), 283 deletions(-)] |
| feature/rc-touch-quarter-return | +6/-0 | live (worktree) | 0255568b Make RC phone driving usable, assist quarter returns and cut  / 81ef3c4f Merge pull request #140 from todd866/feature/park-reference-t / 75bc130d Rebuild neighbourhood skatepark with connected bowl hip and f [66 files changed, 1805 insertions(+), 275 deletions(-)] |
| feature/park-reference-topology | +5/-0 | live (tip <=7d) | 75bc130d Rebuild neighbourhood skatepark with connected bowl hip and f / 9e8ca99b Merge pull request #139 from todd866/feature/residential-rebu / 4b2144f4 docs: distinguish live RC release from flight-site candidate [28 files changed, 1285 insertions(+), 247 deletions(-)] |
| feature/residential-rebuild | +4/-0 | live (tip <=7d) | 4b2144f4 docs: distinguish live RC release from flight-site candidate / 3c34c5e6 chore(release): reserve Build 403 for residential runtime cha / 9e830156 feat(rc): rebuild residential streets and skatepark setting [26 files changed, 1003 insertions(+), 124 deletions(-)] |
| feature/rc-blacksite | +9/-0 | unknown | d6cd617f Add RC gameplay telemetry analytics and offline tests / 12949943 RC: let the MP drop off recovered cars / 4f99684b RC: the MP is a robot (beret and MP brassard kept) [14 files changed, 842 insertions(+), 59 deletions(-)] |
| codex/rc-analytics | +8/-0 | live (worktree) | 182950f3 Add RC gameplay telemetry analytics and offline tests / 4f99684b RC: the MP is a robot (beret and MP brassard kept) / ce0ee0af RC: the MP rides a police cargo quadrotor, not a cloud [14 files changed, 838 insertions(+), 59 deletions(-)] |
| codex/rc-mp-recovery | +8/-0 | live (worktree) | d89147cb RC: let the MP drop off recovered cars / 4f99684b RC: the MP is a robot (beret and MP brassard kept) / ce0ee0af RC: the MP rides a police cargo quadrotor, not a cloud [12 files changed, 312 insertions(+), 59 deletions(-)] |
| playtest/lab-rtb | +11/-0 | live (worktree) | 5701b143 WIP: waves iteration 2 stopped mid-calibration (Codex allowan / 7c19f0fb Rejoin committed wave contacts and reduce W3 to one Veteran / f196bc60 Reduce W3 wing pressure after cohort rejects Veteran pair [240 files changed, 8412 insertions(+), 78 deletions(-)] |
| pathfinders/lab | +15/-0 | live (worktree) | 17205227 Record 90-run Pathfinder v2 comparison and remaining pacing g / df8fc880 Make Pathfinder relay hunt forward, teach envelope hits, and  / fa6e1987 Record 90-seed Pathfinders hunt playtest and fun verdict [255 files changed, 8807 insertions(+), 148 deletions(-)] |
| rapier/pathfinders | +11/-0 | live (worktree) | ac12625c fix: read Pathfinders as dawn and keep ram cruise off the ale / 1556fa5d fix: front-light Pathfinder relays and add gun-window QA hold / 7ddaaa35 fix: bring Pathfinders first-light hunt into view [48 files changed, 3582 insertions(+), 124 deletions(-)] |
| pathfinders-dawn | +11/-0 | live (worktree) | d43fa168 fix: read Pathfinders as dawn and keep ram cruise off the ale / 1556fa5d fix: front-light Pathfinder relays and add gun-window QA hold / 7ddaaa35 fix: bring Pathfinders first-light hunt into view [48 files changed, 3582 insertions(+), 124 deletions(-)] |
| visual/pass-1 | +3/-5 | live (worktree) | a1ebb442 fix(visual): hold the shared horizon colour below the limb / c85b6f39 Revert "fix(visual): restore ground haze beneath the sky hori / f89e2a4f fix(visual): restore ground haze beneath the sky horizon [19 files changed, 584 insertions(+), 170 deletions(-)] |
| visual/ground-try | +1/-5 | unknown | d0216111 WIP: Grok near-field ground detail (unreviewed) / 300c046c fix(visual): retain bandit near LOD through gun range / bcc82a11 visual: fade streamed edges into the sky along the view ray [17 files changed, 424 insertions(+), 189 deletions(-)] |
| visual-fog | +1/-3 | live (worktree) | fc93962f visual: fade streamed edges into the sky along the view ray / ba9dcda1 visual: reuse soft canopy hulls in the near tree ring / d0e48cc9 visual: narrow horizon haze while keeping streamed edges opaq [15 files changed, 222 insertions(+), 118 deletions(-)] |
| release/build-379 | +45/-0 | live (worktree) | 378737d0 smoke: print portrait FIRE interlock diagnostics on failure / a102d6eb smoke: report gun interlock state when portrait FIRE does not / 16749650 smoke: phone stick tests allow the assisted contract's qualif [70 files changed, 5371 insertions(+), 270 deletions(-)] |
| imp/r1-recovery | +50/-0 | live (worktree) | e1d4d9a4 Record the as-built F-22 recovery course in the storyboard / 2a6e6ebc Native end-to-end: fight, recover and stop on the key path (h / dd7aed78 Fly the visual-merge combat sortie's RTB on the F-22 overhead [81 files changed, 6688 insertions(+), 273 deletions(-)] |
| imp/c13-distant-runway | +44/-0 | live (worktree) | 70c074dc Label splash replacement countdown as next bandit / 2da65ae6 Attenuate conventional runway lights by angular distance / 99294836 Stamp Build 379 [74 files changed, 5445 insertions(+), 271 deletions(-)] |
| imp/c12-ai-gunnery | +13/-0 | live (worktree) | 2faef013 Revert "Limit early Ace handoff to coordinated pairs" / 7172c84c Limit early Ace handoff to coordinated pairs / 905e6b64 Let earned Ace leads fight from the opening approach [35 files changed, 2470 insertions(+), 83 deletions(-)] |
| imp/a8-keyboard-core | +21/-0 | live (worktree) | d3371b4a Quicklook: key card for the ordinary F-22 fight only; every o / 87a10897 test: require consecutive desktop gun-window evidence / fd22b4cc test: enforce desktop receipt gates after gimbal integration [43 files changed, 2953 insertions(+), 97 deletions(-)] |
| imp/a7-bandit-fun | +10/-0 | live (worktree) | 270847be test: accept an early solo-primary loss only as a lethal gun  / 29d37be9 Solo cold-primary contract: a gun defeat inside the window is / 30a7468e Bandit fun: it comes back, follows the vertical, and stops st [12 files changed, 1306 insertions(+), 122 deletions(-)] |
| imp/c11-hit-autoaim | +12/-0 | live (worktree) | 0e8237a8 test: cover arena gun state and terrain interlock integration / 770564f1 fix: suppress mounted gun readiness while release is inhibite / 93e703fc fix: sample full M61 trajectories over low terrain [27 files changed, 1892 insertions(+), 72 deletions(-)] |
| imp/c2-bandit-reengage | +6/-0 | live (worktree) | ae965c1b Reduce ramp pursuit cost and improve energy recovery / 67b97f06 Trace live attack gaps and re-engagement guidance reasons / 4c40a176 Improve single-bandit pursuit while preserving bounded planni [10 files changed, 921 insertions(+), 111 deletions(-)] |
| imp/c10-hit-geometry | +3/-0 | live (worktree) | 67279bd5 Pin precision at canopy tips and measure physical gun practic / ca847aa5 Measure airframe collision conversion against legacy geometry / a4d16034 Match F-22 route gun collisions to swept airframe volumes [13 files changed, 624 insertions(+), 32 deletions(-)] |
| visual-ground | +0/-4 | merged-equivalent (cherry all -) | bcc82a11 visual: fade streamed edges into the sky along the view ray / ba9dcda1 visual: reuse soft canopy hulls in the near tree ring / d0e48cc9 visual: narrow horizon haze while keeping streamed edges opaq [14 files changed, 222 insertions(+), 118 deletions(-)] |
| feedback/report | +0/-4 | merged-equivalent (cherry all -) | 4b419ec8 Keep recent performance rows with feedback evidence / 215d9baf Capture in-game feedback with exact-frame evidence and durabl / 9158842a Add feedback report retrieval and admin access [25 files changed, 1734 insertions(+), 21 deletions(-)] |

## 3. Worktrees

Dirty = `git status --porcelain` lines excluding node_modules paths.

| Path | Branch | Exists | Dirty files | Note |
|---|---|---|---|---|
| /Users/iantodd/Projects/guns-only | fix/deploy-headroom | yes | 166 |  |
| /Users/iantodd/.cursor/worktrees/guns-only/pathfinders-dawn | pathfinders-dawn | yes | 0 |  |
| /Users/iantodd/.cursor/worktrees/guns-only/visual-fog | visual-fog | yes | 0 |  |
| /Users/iantodd/.cursor/worktrees/guns-only/visual-ground | visual-ground | yes | 2 |  |
| /Users/iantodd/Documents/Codex.nosync/2026-10-26/task-11/rc-polish | (detached) d058bb34 | yes | 28 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/codex-rc-analytics | codex/rc-analytics | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/codex-rc-mp-recovery | codex/rc-mp-recovery | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/feedback | feedback/report | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a1-opening | imp/a1-opening | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a2-loop | imp/a2-loop | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a4-su27-model | imp/a4-su27-model | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a5-receipt | imp/a5-receipt | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a6-frame-gate | imp/a6-frame-gate | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a7-bandit-fun | imp/a7-bandit-fun | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-a8-keyboard-core | imp/a8-keyboard-core | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c1-tier1-bugs | imp/c1-tier1-bugs | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c10-hit-geometry | imp/c10-hit-geometry | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c11-hit-autoaim | imp/c11-hit-autoaim | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c12-ai-gunnery | imp/c12-ai-gunnery | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c13-distant-runway | imp/c13-distant-runway | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c2-bandit-reengage | imp/c2-bandit-reengage | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c3-payload | imp/c3-payload | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-c7-short-final | imp/c7-short-final | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/imp-r1-recovery | imp/r1-recovery | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/lab-rtb | playtest/lab-rtb | yes | 6 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/next-batch | fix/next-batch | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/pf-lab | pathfinders/lab | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rapier | rapier/pathfinders | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-adventure | feature/rc-adventure | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-baseline-8e17 | (detached) 8e1798eb | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-claude-polish | feature/rc-claude-polish | yes | 8 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-dark-world | feature/rc-dark-world | yes | 7 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-grinds | rc/grinds | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-marseille | rc/marseille | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-next | feature/rc-next | yes | 11 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-philly | rc/philly | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-pipeline | feature/rc-pipeline | yes | 27 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rc-skatestreet | rc/skatestreet | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rel-377 | release/build-377 | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rel-379 | release/build-379 | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/release-384 | release/384 | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/residential-rebuild | feature/rc-touch-quarter-return | yes | 3 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/rtb-sa | fix/rtb-sa | yes | 0 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/ux-pass | ux/shell-instrument-pass | yes | 1 |  |
| /Users/iantodd/Projects/guns-only/.worktrees/visual | visual/pass-1 | yes | 0 |  |

## 4. Stashes

| Ref | Date | Message (branch from message) | Files |
|---|---|---|---|
| stash@{0} | 2026-08-10 07:21 | On fix/ember-run-pass2: WIP foliage beyond 298 — park for ship | 16 files changed, 3153 insertions(+), 678 deletions(-) |
| stash@{1} | 2026-08-03 14:48 | On main: wip: arena + morning-check park for blank-screen hotfix (RESTORED 2026-08-06 after an accidental pop) | 26 files changed, 4119 insertions(+) |
| stash@{2} | 2026-08-03 14:25 | On hotfix/blazor-subroute-framework: hotfix-arena-untracked park |  |
| stash@{3} | 2026-08-03 14:22 | On main: wip: other agents arena/telemetry (park for blank-screen hotfix) | 3 files changed, 80 insertions(+), 2 deletions(-) |
| stash@{4} | 2026-08-03 11:22 | On main: wip: AI telemetry + weekend-ride + playwright (parked for Cobra deploy) | 11 files changed, 429 insertions(+), 22 deletions(-) |
| stash@{5} | 2026-07-30 10:18 | On main: hold concurrent airframe-loop tooling during Build 198 deploy |  |
| stash@{6} | 2026-07-29 18:12 | On pivot-hardening: pre-191 20260729T181218 |  |
| stash@{7} | 2026-07-29 18:10 | On pivot-hardening: pre-deploy soft-world docs 20260729T181054 |  |
| stash@{8} | 2026-07-29 17:51 | On pivot-hardening: pre-build-190 20260729T175145 |  |
| stash@{9} | 2026-07-29 17:47 | On pivot-hardening: mid-deploy concurrent plates 20260729T174719 | 1 file changed, 1 insertion(+), 1 deletion(-) |
| stash@{10} | 2026-07-29 17:44 | On pivot-hardening: pre-build-189 remaining plates 20260729T174459 | 6 files changed, 6 insertions(+), 6 deletions(-) |
| stash@{11} | 2026-07-29 17:43 | On pivot-hardening: pre-build-189-stamp concurrent blueprints 20260729T174351 | 32 files changed, 49 insertions(+), 49 deletions(-) |
| stash@{12} | 2026-07-29 17:39 | On pivot-hardening: pre-deploy-web-prod 20260729T173947 | 63 files changed, 346 insertions(+), 346 deletions(-) |
| stash@{13} | 2026-07-29 12:41 | On pivot-hardening: wip-before-launch-gallery-merge | 1 file changed, 12 insertions(+), 4 deletions(-) |
| stash@{14} | 2026-07-29 12:17 | On pivot-hardening: wip-mesh-tour-recovery-incomplete-round2 | 17 files changed, 568 insertions(+), 63 deletions(-) |
| stash@{15} | 2026-07-29 12:14 | On pivot-hardening: wip-mesh-nav-presentation | 1 file changed, 40 insertions(+) |
| stash@{16} | 2026-07-29 12:13 | On pivot-hardening: wip-mesh-test-pins-and-recovery-gates | 4 files changed, 77 insertions(+), 12 deletions(-) |
| stash@{17} | 2026-07-29 12:13 | On pivot-hardening: wip-mesh-tour-recovery-incomplete | 10 files changed, 403 insertions(+), 42 deletions(-) |
| stash@{18} | 2026-07-28 18:51 | On codex/rapier-computer-loss-20260728: transfer snapshot before clean reapply | 9 files changed, 345 insertions(+), 36 deletions(-) |
| stash@{19} | 2026-07-28 10:26 | On audio-hybrid-production: wip-before-prod-deploy-102608 | 16 files changed, 431 insertions(+), 81 deletions(-) |
| stash@{20} | 2026-07-28 10:17 | On audio-hybrid-production: wip-frame-budget-doc |  |
| stash@{21} | 2026-07-28 10:16 | On audio-hybrid-production: wip-non-audio-before-deploy | 12 files changed, 399 insertions(+), 70 deletions(-) |
| stash@{22} | 2026-07-27 21:38 | On worktree-binary-snapshot-bridge: wip app.js presentation id | 1 file changed, 1 insertion(+), 1 deletion(-) |
| stash@{23} | 2026-07-27 21:37 | On worktree-binary-snapshot-bridge: wip soft-world scenery and airframe docs | 6 files changed, 236 insertions(+), 116 deletions(-) |
| stash@{24} | 2026-07-27 21:11 | On worktree-binary-snapshot-bridge: lob fuel oft dirty | 1 file changed, 37 insertions(+) |
| stash@{25} | 2026-07-27 21:11 | On worktree-binary-snapshot-bridge: wip before eastern merge + deploy | 11 files changed, 616 insertions(+), 94 deletions(-) |
| stash@{26} | 2026-07-27 20:54 | WIP on feature/eastern-authority-points: 80bfb97 Stamp Build 154 for Circuits FD teaching and scenery ship. |  |

## 5. Safe to delete now

Fully merged into main and not checked out in any worktree (37). Note: merged includes branches with 0 commits ahead of main; their tips remain reachable from main. Branches that still have a remote-tracking ref are marked (remote).

- fix/flight-frame-hitch (remote)
- release/saucer-residential-hills (remote)
- fix/rc-independent-cache (remote)
- release/396 (remote)
- release/395 (remote)
- release/393 (remote)
- release/392 (remote)
- release/391 (remote)
- release/390 (remote)
- release/389 (remote)
- release/388 (remote)
- release/387 (remote)
- release/386 (remote)
- fun/rtb-compress (remote)
- playtest/lab (remote)
- ux-premium
- release/382 (remote)
- visual-audit
- ux-sheet
- ux-variants
- imp/c8-bfm-ladder (remote)
- imp/c9-tan-polygon (remote)
- imp/a3-touch-hud (remote)
- release/build-376 (remote)
- fix/cold-terrain-performance-gate (remote)
- fix/offline-resilience-build-374 (remote)
- fix/frame-gate-deps (remote)
- rung0-cohort (remote)
- feat/f22-bandit-pressure (remote)
- refactor/session-partials (remote)
- session-split (remote)
- chore/single-source-build-stamp (remote)
- chore/deploy-frame-gate (remote)
- docs-truth (remote)
- docs/status-truth (remote)
- build-stamp-once (remote)
- fix/practice-smoke-sim-time (remote)

## Needs a human

### RC live trunk candidates (do not delete) (2)
- feature/rc-adventure (2026-10-31, 171 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-adventure
- feature/rc-next (2026-10-31, 163 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-next

### Other live (worktree attached or tip within 7 days) (39)
- feature/rc-pipeline (2026-10-31, 172 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-pipeline
- feature/rc-dark-world (2026-10-31, 169 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-dark-world
- feature/rc-claude-polish (2026-10-30, 95 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-claude-polish
- rc/nyfill (2026-10-29, 85 ahead)
- rc/ny (2026-10-29, 82 ahead)
- rc/venice (2026-10-29, 79 ahead)
- rc/polish (2026-10-29, 73 ahead)
- rc/plazafill (2026-10-29, 69 ahead)
- rc/carscale (2026-10-29, 66 ahead)
- rc/philly (2026-10-29, 62 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-philly
- rc/marseille (2026-10-28, 59 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-marseille
- rc/skatestreet (2026-10-28, 50 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-skatestreet
- rc/grinds (2026-10-28, 48 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rc-grinds
- feature/rc-location-jumps (2026-10-26, 26 ahead)
- feature/rc-world-finish (2026-10-26, 23 ahead)
- feature/rc-route-frontages (2026-10-26, 21 ahead)
- feature/rc-outer-roads (2026-10-26, 19 ahead)
- feature/rc-corridor-fidelity (2026-10-26, 16 ahead)
- feature/rc-world-surface-polish (2026-10-26, 12 ahead)
- feature/rc-touch-quarter-return (2026-10-25, 8 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/residential-rebuild
- feature/park-reference-topology (2026-10-25, 6 ahead)
- feature/residential-rebuild (2026-10-25, 4 ahead)
- codex/rc-analytics (2026-10-23, 8 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/codex-rc-analytics
- codex/rc-mp-recovery (2026-10-23, 8 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/codex-rc-mp-recovery
- playtest/lab-rtb (2026-10-16, 11 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/lab-rtb
- pathfinders/lab (2026-10-16, 16 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/pf-lab
- rapier/pathfinders (2026-10-16, 11 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rapier
- pathfinders-dawn (2026-10-16, 11 ahead) worktree: /Users/iantodd/.cursor/worktrees/guns-only/pathfinders-dawn
- visual/pass-1 (2026-10-15, 8 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/visual
- visual-fog (2026-10-15, 4 ahead) worktree: /Users/iantodd/.cursor/worktrees/guns-only/visual-fog
- release/build-379 (2026-10-14, 54 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rel-379
- imp/r1-recovery (2026-10-14, 59 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-r1-recovery
- imp/c13-distant-runway (2026-10-14, 53 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c13-distant-runway
- imp/c12-ai-gunnery (2026-10-14, 14 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c12-ai-gunnery
- imp/a8-keyboard-core (2026-10-14, 23 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a8-keyboard-core
- imp/a7-bandit-fun (2026-10-14, 11 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a7-bandit-fun
- imp/c11-hit-autoaim (2026-10-14, 13 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c11-hit-autoaim
- imp/c2-bandit-reengage (2026-10-13, 6 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c2-bandit-reengage
- imp/c10-hit-geometry (2026-10-13, 3 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c10-hit-geometry

### Unmerged but patch-equivalent to main (cherry all -); still unmerged by ancestry, human to confirm (2)
- visual-ground (2026-10-15, 4 ahead) worktree: /Users/iantodd/.cursor/worktrees/guns-only/visual-ground
- feedback/report (2026-10-15, 4 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/feedback

### Unknown (unmerged, unique commits, no worktree, tip older than 7 days) (2)
- feature/rc-blacksite (2026-10-23, 9 ahead)
- visual/ground-try (2026-10-15, 6 ahead)

### Merged but checked out in a worktree (keep until worktree removed) (14)
- fix/deploy-headroom (2026-10-24, 0 ahead) worktree: /Users/iantodd/Projects/guns-only
- release/384 (2026-10-16, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/release-384
- ux/shell-instrument-pass (2026-10-15, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/ux-pass
- fix/next-batch (2026-10-14, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/next-batch
- fix/rtb-sa (2026-10-14, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rtb-sa
- release/build-377 (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/rel-377
- imp/a6-frame-gate (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a6-frame-gate
- imp/a5-receipt (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a5-receipt
- imp/a1-opening (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a1-opening
- imp/c7-short-final (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c7-short-final
- imp/a2-loop (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a2-loop
- imp/c1-tier1-bugs (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c1-tier1-bugs
- imp/c3-payload (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-c3-payload
- imp/a4-su27-model (2026-10-13, 0 ahead) worktree: /Users/iantodd/Projects/guns-only/.worktrees/imp-a4-su27-model

### Stashes
All 27 stashes need a human; none are recommended for dropping.
