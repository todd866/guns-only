# Idea capture: reclined seating, and 2030s Ukraine as the setting

*2026-07-26. Captured from a design conversation, not yet a plan. Owner's framing: "I still wanna
get these ideas down before I forget them."*

Two ideas, one of which is a mechanic and one of which is a setting. The mechanic is the more
interesting of the two because it makes the platform's central thesis physical.

---

## 1. Seat recline as a G-tolerance axis

> "By then they might be making low-cost lightweight fighters with AI and seat recline. So it would
> be cool to rebuild our physiology model around that. Like, if the pilot can go full recline then
> how much G can they pull?"

### Why this is a mechanic and not a detail

G-induced loss of consciousness is, to first order, a **hydrostatic** problem. Arterial pressure at
eye level falls as the vertical blood column between heart and eye is multiplied by Gz. Reclining
the seat does not make the pilot tougher — it shortens the *vertical component* of that column by
`cos(seatback angle from vertical)`.

That single cosine is the whole idea, and it has a sharp consequence: **the benefit is small until
the recline is large.**

| seatback from vertical | vertical column retained | character |
|---|---:|---|
| 0° (upright, most fast jets) | 100% | baseline |
| 30° (F-16) | ~87% | modest — this is why the F-16's recline is not the G advantage it is often assumed to be |
| 55–65° | ~57–42% | the region where tolerance changes materially |
| 90° (supine) | ~0% | hydrostatic term vanishes entirely; other limits take over |

So a 30° seat buys very little, which is the counter-intuitive and therefore interesting part. The
prize only appears past roughly 45–55°, and it appears fast.

### What stops you reclining today, and why this world removes it

Every historical blocker on deep recline is a **human-interface** problem, not a physiological one:

- you cannot see over the nose or out of the cockpit;
- you cannot reach or use conventional controls;
- head movement under G becomes a neck-injury risk;
- ejection geometry and canopy clearance get harder.

**An AI-flown aircraft deletes the first two outright and mostly deletes the third.** If the human
aboard is a decision-maker rather than a stick-and-rudder pilot, there is no reason for them to look
outside, and the interface can be gaze, voice and touch rather than a stick they must reach. The
canopy stops being a window and becomes structure.

That is the thesis made physical: **the automation is what unlocks the airframe's G envelope**, by
removing the human-factors constraints that kept the seat upright. A cheap lightweight AI fighter
with a deeply reclined occupant out-turns a better aircraft with a better pilot sitting up — and the
reason is posture, not skill.

### The limits that replace the hydrostatic one

Recline does not give unlimited G. Past roughly 60–70° the binding constraints change kind:

- **Respiratory.** Gz acting front-to-back through a supine chest loads the ribcage against
  breathing. Sustained high G supine is a ventilation problem before it is a vision problem.
- **Spinal and structural.** Load path through the seat changes; so does injury tolerance.
- **Interface.** Even gaze and voice degrade under high G, and a reclined occupant who must act is
  slower.
- **Escape.** A reclined ejection is a different, harder problem — and this project is about to have
  an ejection model (`docs/ejection-design.md`), so the two ideas meet directly.

The interesting design consequence is that **recline should be a dial with a real cost**, not a free
upgrade: more recline buys G and spends manual authority, situational awareness and escape margin.
That is a genuine tradeoff the player can be asked to make, and it is the same shape as every other
good decision in this sim.

### Where it lands in the code

`sim/PilotPhysiology.cs` composes four profiles today:

```
PilotPhysiologyProfile = Constitution + ProtectionEquipment + Technique + ImpairmentResponse
```

There is **no seat geometry anywhere**, and `PilotPhysiologyInput.NormalAccelerationG` is documented
as the *seated-pilot* Z-axis load factor — an upright pilot is baked into the axis definition. So the
extension is clean and additive:

- add a fifth profile axis, `PilotSeatProfile`, carrying seatback angle and the limits that come with
  it;
- resolve aircraft normal acceleration into the pilot's eye-to-heart axis before the existing model
  sees it, rather than modifying the tolerance curves;
- let the respiratory/interface penalties enter as their own terms so the model does not simply
  reward recline monotonically.

Resolving the axis rather than editing the curves matters: it keeps the validated upright behaviour
bit-identical at 0° recline, which makes the whole change testable against the existing corpus.

Airframe side: `PositiveStructuralLimitG` is already 12 for the F-22A surrogate — the 9 G everyone
quotes is a *pilot* limit that got codified into an airframe. An aircraft designed around a reclined
occupant has no reason to stop at 9.

### Numbers to verify before any of this becomes a constant

**None of the following are yet sourced to primary literature, and they must be before they enter
the kernel.** The repo's own discipline applies (`PublicDataSurrogate`, source locks,
`docs/pilot-g-physiology.md`):

- hydrostatic gradient per centimetre of blood column per G;
- typical eye-to-heart vertical distance for a seated pilot;
- the measured tolerance gain at 30° (believed modest, order +0.5 G) and in the 55–75° band
  (believed substantial, order +2 G or more);
- where respiratory limiting actually begins with recline angle.

The AGARD/USAF reclined-seat literature from the 1970s–90s is the place to look, and it belongs in
paperlibrary before it belongs in `sim/`.

### How much G, actually — and what it does to the aircraft

> "I don't even know what the physiology *is* on that, presumably you can pull a *lot* of G."

A lot, and for a reason beyond the cosine above. Past roughly 60 degrees the load stops being **+Gz**
(head-to-foot, the axis that starves the brain) and becomes largely **+Gx** (chest-to-back, "eyeballs
in"). Those axes are not comparable. Trained and suited, +Gz tops out around 9. +Gx is the axis
spacecraft launch and re-entry couches are built around, and humans take double-digit Gx routinely —
limited there by ribcage loading and the ability to breathe, not by cerebral perfusion.

**So the human plausibly stops being the binding constraint.** A fully reclined occupant moves the
ceiling from ~9 G into the high teens, at which point the wing, the spar and the engine decide the
limit. That is the design unlock, and it is much bigger than the seat.

Instantaneous turn, omega = g * sqrt(n^2 - 1) / V, at 200 m/s TAS:

| structural limit | instantaneous turn rate | turn radius |
|---|---:|---:|
| 9 G — today's *pilot* ceiling | 25 deg/s | 456 m |
| 15 G | **42 deg/s** | **272 m** |
| 20 G | 56 deg/s | 204 m |

In a guns fight fought at a few hundred metres, halving the turn radius is the whole engagement.

**Sustained turn does not move.** Sustained G is thrust-limited and recline gives no extra power, so
the aircraft this implies is an instantaneous-turn monster that bleeds energy catastrophically: it
can point at anything, once. That is a genuinely different adversary from an F-22 and a genuinely
different aircraft to fly — and it is an excellent fit for guns-only, where pointing is cheap,
staying is expensive, and the gun is the weapon that rewards the former.

Design brief that falls out of it: small, low wing loading, modest thrust, built to a structural
limit no crewed aircraft has ever been built to, with the human reclined out of the control loop
rather than inside it. The airframe is cheap because it is small and because it does not have to
carry a pilot who needs to see out.

Open question worth an early answer: an aircraft manoeuvring in three dimensions does not apply load
along one body axis. Reclined, a pull is mostly +Gx — but roll and sideslip put load into axes with
their own, much lower, tolerances. A recline model that only resolves the pull will flatter the
design. The physiology step should take a load *vector* in pilot-body axes, not a scalar.

---

## 2. 2030s Ukraine instead of (or alongside) Korea

Worth taking seriously, for reasons that are mostly about evidence rather than novelty.

**For:**

- It is the actual laboratory of drone war. Attrition economics, electronic warfare, improvised and
  attritable airframes, and the cost-per-kill problem that motivates guns-only are all *documented*
  there rather than extrapolated.
- It removes the alternate-history burden. Korea 2030s requires inventing a war; Ukraine 2030s
  requires extrapolating one, which is a much cheaper claim to defend and fits the existing
  fact/fiction boundary discipline better.
- **The terrain pipeline transfers unchanged.** Copernicus GLO-30 covers Ukraine exactly as it covers
  Korea; `tools/terrain/` needs a new source lock region and nothing else.

**Against, or at least to think about:**

- It is a live war with real casualties. The "nobody is ever rendered" doctrine already answers this
  better than most projects could, but the answer should be deliberate rather than inherited.
- The terrain is a genuinely different *game*. Korea's central front is mountainous and offers
  terrain masking; Ukraine is largely flat-to-rolling steppe cut by big rivers. Sightlines are long
  and masking is scarce, which pushes the low-altitude game away from valley-flying and toward
  electronic warfare and standoff. That is a different set of skills, not a reskin — and arguably a
  better fit for the drone/air-littoral rungs than Korea is.
- The existing Korea work is not wasted either way: it can stay as the speculative theatre while
  Ukraine becomes the evidenced one, which is a stronger pairing than either alone.

---

## Why these two ideas belong in the same note

A cheap lightweight fighter with an AI pilot and a reclined human aboard is exactly the aircraft an
attritional peer war produces — and it is exactly the aircraft that would be fielded past its
peacetime certification envelope, because the alternative is worse. The recline mechanic, the
guns-only economics, and the automation-fielded-too-early thesis are the same argument seen from
three directions.
