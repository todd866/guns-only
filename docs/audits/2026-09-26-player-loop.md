# Build 372: a more coherent sortie and practice loop

Candidate only, not deployed. Based on production Build 371, revision
`0e8ea60a8159b2da6ba9f246c334c3bc1ae35493`, checked on 2026-09-26.

## Player-facing changes

- A public F-22 sortie keeps its opening opponent skill, mount, formation size and aiming aid
  through its second engagement. The director still learns from physical hits and kills and
  persists the earned difficulty for the next sortie. The opening sparring presentation ends
  before the second engagement. Neither first-run valley nor other aircraft are broadened into
  this rule.
- F-22 debriefs distinguish completed mission, safe early recovery, aircraft loss and mutual kill.
  A victory card requires the simulator's VICTORY outcome plus completed, survivable runway
  contact/recovery. Two individual kills do not stand in for two formation engagements. Landing
  fuel and reserve appear only when recovery occurred and the snapshot supplies numbers.
- The result offers relevant practice: recovery after a landing/return loss, valley after terrain
  loss or Auto-GCAS, and gunnery after a combat loss or unfinished combat task. Safety and airframe
  review corrections retain priority. Practice remains separate from a completed full sortie.
- Briefings describe the current finite missions. The first-run sequence is stated once and the
  live HUD still owns the next action. Desktop briefing/result controls sit beside the reading
  column; larger text and narrow layouts retain accessible controls. Practice results no longer
  repeat the same statistics or present duplicate restart actions.
- Poster text uses ordinary layout instead of competing absolute offsets. Weekend Ride's lap
  card no longer overlaps its minimap, narrow speed/RPM cards have separate space, and results
  hide absent lap records and empty sector grids.

## Verification

The focused JavaScript tests exercise mission scoping, practice exclusion, recovery truth,
mutual kills, missing numeric evidence, landing deviation masks, safety priority and Ride evidence
visibility. Simulator regression tests cover unchanged assistance through the cold second fight,
earned difficulty on the next sortie, and two complete pair engagements before RTB.

The local full release gate passed: 1,956 runtime JavaScript tests, 2,653 simulator tests
(10 existing skips), 10 server tests, four arena-server tests, 22 published browser smoke tests,
and 2,305 HUD geometry assertions, alongside the deterministic/content contracts. Its
software-rendered smoke is separate from the hardware checks below.

After the gate built its artifact, a small logbook correction preserved the existing coaching
for non-F-22 visual merges while retaining safety priority. All 65 focused coaching/progression
tests passed, and the final publication was rebuilt. The practice smoke was also strengthened
to require actual gun-practice completion before exercising the single Repeat practice action.
That published practice/staging/input/pause/repeat/logbook check passed against the final rebuilt
artifact (one test, zero failures). The full gate was not rerun for these final two focused changes.

Silent headless Chromium hardware checks used the actual Apple M5 Metal renderer and current web
source against published WASM. No simulator state was injected in these player-flow checks:

- Open the picker and intro at 1366×768, 1280×720, 390×844 and 844×390. Check actual viewport
  screenshots and primary action geometry. Double computed text sizes at 1280×720.
- Open Practice, select Controlled gun pass, launch, hold the actual fire key and reach Exercise
  complete with two physical hits. Repeat the prepared exercise with the browser network disabled
  and reach the same terminal result.
- Return to Aircraft, launch the normal F-22 sortie, fly into terrain using keyboard input, wait
  for the simulator's DEFEAT, inspect the debrief, then choose Practise valley. The resulting Ready
  screen is Clear the valley. Check the loss card at laptop, short laptop, portrait and landscape.
- Ride with real throttle input, inspect lap/map and speed/RPM separation at 1366×768 and 360×640,
  then use Pause → End ride. Verify that incomplete timing evidence does not produce empty rows.

All checked viewport geometry passed in the final capture; no page errors were recorded. These
are interaction and layout checks, not a 60 fps performance qualification. Local screenshots,
authority summaries and the reproducible capture script are in
`/Users/iantodd/Projects/guns-only-review/2026-09-26/improvements/`.

## Review decisions and limits

An independent Cursor review and adversarial review were checked against source and browser
evidence. Safety correction priority was repaired. The suggestion to infer mission completion
again from kills in the UI was rejected: the simulator owns victory, formation engagements contain
multiple aircraft, and first-run valley has a different combat contract. The suggestion to freeze
valley difficulty was also rejected: valley has no successor wave, and learning occurs when the
engagement ends, immediately followed by RTB.

This candidate does not claim a human-tested full F-22 combat-to-landing flight. Simulator recovery
fixtures validate physical landing/stop and outcome authority using controlled setup; they are
not evidence that a first-time pilot can find and fly the entire approach. Wider handling,
difficulty tuning, cross-mission progression and fresh human acceptance remain separate work.
No preview experience is promoted and no new physics constants or assets are introduced.
