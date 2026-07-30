# The Long Way Home: playable screenplay

Status: source-labeled skeleton; dialogue not locked  
Sequence: `sequence.korea-1951.armstrong-cable-strike.v1`  
Nominal running time: 22 minutes

## Reading key

- **HISTORY** — an event or condition supported by a registered historical source.
- **ENGINEERING** — a sourced or explicitly bounded physical claim.
- **RECONSTRUCTION** — authored connective detail needed to make the event playable.
- **PLAYER** — action or performance owned by the current run.

All dialogue is **RECONSTRUCTION** until a surviving transcript is registered. Source support for
an event does not turn newly written words about that event into quotation.

The camera stays in the player's normal flight view whenever an input can materially affect
survival. Exterior views below are reference-board or replay shots unless the scene explicitly
places them outside a control-critical interval.

## 01 — Essex

Target: 00:00-02:00  
Checkpoint on completion: `checkpoint.armstrong.airborne.v1`

**RECONSTRUCTION — image**

A dark-blue Panther sits on a straight carrier deck. It is compact beside the ship and enormous
beside the people handling it. The morning and exact deck station remain uncommitted until the
action report, deck plan and weather record are locked.

Deck personnel finish the launch sequence through sourced hand signals and physical actions. There
is no narrated biography and no date card more specific than:

> KOREA · SEPTEMBER 1951  
> A HISTORICAL RECONSTRUCTION

**PLAYER**

The player performs only the checks exposed by the eventual Panther source model, aligns the
aircraft and accepts the catapult. A missed check produces a legible correction or checkpoint
restore; it does not create busywork.

**SOUND**

Engine, deck machinery, wind, sea, blast deflectors or period equivalents after source lock. Music
is absent. No deck voice is written yet.

**AUTHORITY**

Advance only when catapult authority emits
`event.narrative.deck-launch-complete.v1`.

## 02 — Join

Target: 02:00-03:20

**RECONSTRUCTION — action**

The player takes position on Carpenter's wing. The coast is a distant value break under large
weather. The mission offers formation bearing and range through period-appropriate cues, not a
floating cinematic path.

**RADIO — RECONSTRUCTION**

- `line.carpenter.02-take-position.v1` — CARPENTER: “Two, take the right.”
- `line.armstrong.02-position-ack.v1` — ARMSTRONG: “Two.”

**PLAYER**

Join, stabilize and cross the authored coast gate inside the formation envelope.

**AUTHORITY**

Advance on `event.narrative.korea-coast-crossed.v1`. Presentation may not infer the crossing from
camera position.

## 03 — Into the valley

Target: 03:20-05:20  
Checkpoint on completion: `checkpoint.armstrong.attack-ingress.v1`

**HISTORY**

The sortie operated west of Wonsan in the Majon-ni target region according to current sources.

**RECONSTRUCTION**

The exact terrain cell, ingress direction, route altitude, landmarks and cable field are not yet
established. The designed corridor narrows attention through terrain, formation and target work
without pretending to reproduce an undocumented map.

**RADIO — RECONSTRUCTION**

- `line.carpenter.03-descend.v1` — CARPENTER: “Going down. Stay with me.”

**PLAYER**

Descend behind Carpenter, manage terrain clearance and enter the target area.

**SOUND**

Airflow rises; the engine remains steady; radio falls quiet. No threat music telegraphs the cable.

## 04 — Armed reconnaissance

Target: 05:20-07:20  
Checkpoint on entry: `checkpoint.armstrong.attack-run.v1`

**HISTORY**

Armstrong described Korean War flights as interdiction against bridges, railroads and occasional
vehicles. The incident sortie is associated with transportation and storage facilities in the
Majon-ni area. The exact target, formation, loadout and employment sequence remain blocked on the
action report.

**RECONSTRUCTION**

The mission supplies one validated military objective and marks inhabited scenery as
non-targetable. The required employment path naturally feeds the cable egress corridor.

**RADIO — RECONSTRUCTION**

- `line.carpenter.04-lead-in.v1` — CARPENTER: “Lead's in.”
- `line.armstrong.04-two-in.v1` — ARMSTRONG: “Two's in.”

**PLAYER**

Fly the target run. The player can perform it well or poorly within the recoverable envelope, but
cannot abandon it and continue the story.

**AUTHORITY**

Weapon and target truth comes from the simulation. The sequence advances when the employment gate
and canonical egress gate emit `event.narrative.attack-run-complete.v1` and
`event.narrative.cable-corridor-entered.v1`.

## 05 — The cable

Target: 07:20-07:35  
Checkpoint after damage commit: `checkpoint.armstrong.damaged-flight.v1`

**HISTORY**

Armstrong later recalled striking an antiaircraft cable, not being directly hit by antiaircraft
fire. He estimated losing six to eight feet of the right wing.

**RECONSTRUCTION**

The number, material, support geometry, sag, exact altitude and placement of cables remain unknown.
The playable corridor uses physical authored cables and discloses that layout as reconstruction.

**PLAYER**

Continue flying the required egress. There is no dodge prompt. Contact occurs through swept
collision against the same geometry the renderer displays.

**IMAGE**

The cable competes honestly with terrain and motion. It is not invisible, highlighted or moved at
the final instant. Contact is too fast to become a tableau: cable, sharp impulse, right-wing
structure departing, horizon rotating.

**SOUND**

A brief high-tension report, torn aluminium, buffeting and loose structure. No explosion unless the
physical model produces one; the authored event does not.

**AUTHORITY**

The strike completes only after `event.narrative.cable-contact.v1` and
`event.narrative.right-wing-damaged.v1` are committed in order.

## 06 — Hold it

Target: 07:35-09:20

**ENGINEERING**

The damaged Panther carries persistent right-side lift loss, drag change and reduced lateral
authority. Exact coefficients are reconstruction values inside a source-bounded sensitivity
envelope.

**PLAYER**

Control never leaves the player. Arrest the roll, avoid terrain, climb if possible and discover the
speed below which control margin collapses.

The first cue is physical: the direction of roll, stick demand, sideslip, buffeting and the visible
horizon. A concise accessibility cue may reinforce those facts without driving the controls.

**RADIO — RECONSTRUCTION**

Radio remains silent during the first unrecovered roll. Once workload authority says a transmission
will not mask the first correction:

- `line.armstrong.06-damage-report.v1` — ARMSTRONG: “Lead, Two. I hit a cable. Right wing's
  damaged.”
- `line.carpenter.06-coming-across.v1` — CARPENTER: “Climb if you can. I'm coming across.”

**AUTHORITY**

Advance only after the aircraft remains within the authored controllability, roll and
terrain-clearance bounds for the stabilization interval.

## 07 — No landing

Target: 09:20-12:00  
Checkpoint on completion: `checkpoint.armstrong.southbound.v1`

**HISTORY**

Armstrong recalled that he and Carpenter discussed the aircraft and rejected landing because
slowing could produce a snap he could no longer control.

**RECONSTRUCTION**

The inspection station, dwell, exact visible report and words are authored. Carpenter receives no
hidden damage state.

**PLAYER**

Hold the damaged Panther steady enough for Carpenter to move into an observer-safe inspection
position. The continuing stick load prevents the scene from becoming a cutscene.

**RADIO — RECONSTRUCTION**

- `line.carpenter.07-hold-inspection.v1` — CARPENTER: “Hold it there.”
- `line.carpenter.07-visible-damage.v1` — CARPENTER: “Your right tip is gone.”
- `line.armstrong.07-control-margin.v1` — ARMSTRONG: “It takes nearly all the stick to hold it. If
  I slow down, it'll go.”
- `line.carpenter.07-no-landing.v1` — CARPENTER: “Then we don't land it. Head south. I'll stay with
  you.”

The control-margin line is selected only when the recorded input and damaged model support it. If
the final simulation does not, the line must change; the radio cannot overrule physics.

**AUTHORITY**

Inspection completes from relative geometry, dwell and visible damage. The mission controller then
commits `event.narrative.ejection-decision.v1`.

## 08 — South

Target: 12:00-16:30  
Checkpoint on completion: `checkpoint.armstrong.ejection-area.v1`

**HISTORY**

Armstrong recalled flying south into friendly territory before ejecting near Pohang/K-3.

**PLAYER**

Preserve airspeed, altitude and control margin while following the southbound route. This section is
shortened dynamically only within authored bounds: clean performance does not require dead transit,
and poor but recoverable performance is not hidden by a cut.

**RADIO — RECONSTRUCTION**

- `line.carpenter.08-friendly-ahead.v1` — CARPENTER: “Friendly territory ahead.”

**IMAGE**

The landscape opens. The aircraft still flies with a visible asymmetric attitude. No golden
victory light appears simply because the boundary is near.

**AUTHORITY**

Advance on `event.narrative.friendly-territory-entered.v1`, not elapsed time.

## 09 — Prepare

Target: 16:30-18:20  
Checkpoint on entry: `checkpoint.armstrong.ejection-setup.v1`

**HISTORY**

The broad outcome—ejection near K-3—is supported.

**ENGINEERING / RECONSTRUCTION**

The ejection envelope, seat model, canopy action, restraints and action order remain blocked on the
applicable 1951 handbook and equipment record. No final control prompt is written before that lock.

**RADIO — RECONSTRUCTION**

- `line.carpenter.09-clear-aircraft.v1` — CARPENTER: “Point it clear. Keep the speed.”

**PLAYER**

Align the damaged Panther into a safe disposal corridor while still carrying the control load.
Complete only the actions the sourced equipment actually required.

**AUTHORITY**

The ejection control remains unavailable until the authoritative readiness predicate is true. An
accessibility timing assist can widen margins but cannot falsify the envelope.

## 10 — Punch out

Target: 18:20-18:45  
Checkpoint after canopy deployment: `checkpoint.armstrong.under-canopy.v1`

**RADIO — RECONSTRUCTION**

- `line.armstrong.10-going-out.v1` — ARMSTRONG: “I'm getting out.”
- `line.carpenter.10-ack.v1` — CARPENTER: “Roger.”

The player may actuate the ejection while Carpenter's acknowledgement is still audible.

**PLAYER / ENGINEERING**

Initiate ejection. Seat, pilot and aircraft separate through authoritative physics in the sourced
order. The camera maintains a continuous spatial relationship. Blast is abrupt and ugly; it is not
an action-film launch.

**AUTHORITY**

The beat completes only after ordered ejection, seat separation and parachute deployment events.
The damaged aircraft continues its own integration.

## 11 — Back over land

Target: 18:45-21:00

**HISTORY**

Armstrong recalled being carried over land and descending into friendly territory.

**PLAYER**

Use only the limited actions supported by the sourced parachute abstraction. Prepare for ground
contact. Do not turn the descent into a steerable sport canopy sequence.

**SOUND**

Canopy opening, risers, wind, distant aircraft and then space. Music, if later admitted, enters
below the environmental sound and does not tell the player how to feel.

**IMAGE**

The person is very small. Worked ground and scattered structures establish scale. The falling
Panther remains geographically coherent but does not become spectacle.

## 12 — Recovery

Target: 21:00-22:00  
Checkpoint on completion: `checkpoint.armstrong.complete.v1`

**ORAL-HISTORY ACCOUNT**

Armstrong recalled that a jeep from K-3 arrived as he landed and that its driver was Goodell Warren,
a former flight-school roommate then serving as a Marine lieutenant.

**RECONSTRUCTION**

Until corroboration and location review are complete, the board shows the broad action without
inventing a rice paddy, joke, injury, greeting or embrace. No one says the Moon was waiting.

The parachute collapses. The jeep approaches and stops. Engine idle replaces aircraft noise. Hold
long enough for the scale change to register.

**PLAYER**

No false interaction prompt. The player may skip the bounded quiet interval after its minimum
comprehension time.

**DEBRIEF**

The first card says:

> DOCUMENTED EVENT  
> Armstrong later described a cable strike, major right-wing loss, a damaged flight south and
> ejection near K-3.

The second says:

> RECONSTRUCTED FOR PLAY  
> The exact route, cable installation, target run, radio exchange, damaged aerodynamics and
> ejection procedure contain declared reconstruction.

The third uses recorded evidence:

> YOUR FLIGHT  
> First recoverable correction, maximum roll rate, control margin, inspection stability, route
> discipline and ejection preparation.

No numerical score grades whether history happened.
