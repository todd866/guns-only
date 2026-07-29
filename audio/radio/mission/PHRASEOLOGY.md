# PHRASEOLOGY.md — How military R/T is actually spoken

Sourced reference for the Rapier mission-radio catalog (`lines.json`). Every claim below was
pulled from a source a researcher actually opened; every quoted transmission is verbatim from
that source. Future catalog passes should cite this document line-by-line. Companion doctrine:
`README.md` (comms doctrine, authoring gate, voice bar).

---

## 1. How to read this document

Every statement carries an evidence tier:

| Tag | Meaning | Weight |
|-----|---------|--------|
| **[OFFICIAL]** | A publication says it: FAA JO 7110.65, AIM, NATOPS, ATP 1-02.1, AFI/AFMAN/AETCMAN, CNATRA FTIs | Rulebook truth. ATC/LSO/CONTROL characters follow it. |
| **[OBSERVED]** | Real recordings, mishap transcripts (NTSB/AIB/Board of Inquiry), practitioner accounts show it | How people actually sound. Pilot characters follow it. |
| **[LORE]** | Sim forums / uncorroborated community claims | Low reliability. Never the sole basis for a line. |
| **[HOUSE]** | Rapier invention with no real-world grounding found | Allowed for the AI-first fiction, but must be declared here, never attributed to a pub. |

Rule of the document: **a call the research could not ground is flagged, not defended.** See §6
for named gaps and §7 for line-by-line catalog verdicts.

The pubs themselves license the sim's central design tension — rulebook ATC vs stylish pilots:

> "Use of nonstandard and improvised phrasing, while common, only contributes to miscommunication and should be minimized."
> — AFMAN 11-248, T-6 Primary Flying, para 1.17.1 **[OFFICIAL, conceding OBSERVED]**

---

## 2. Universal mechanics

### 2.1 Contact format

**[OFFICIAL]** Initial callup = facility being called, FULL aircraft ID, position, request;
"Over" only if required (AIM 4-2-3). USAF codifies the pilot call as *agency, callsign,
location, request*:

> "San Antonio Approach, Texan 10, Area 8 low, request Auger ILS with bravo." — AFMAN 11-248 para 1.17.2.2
> "New York Radio, Mooney Three One One Echo." — AIM 4-2-3

After initial contact, the station name and "Over" may be omitted when the reply is obvious
(AIM 4-2-3; JO 7110.65 2-4-8). For radar finals: "TERMINAL. You may omit aircraft
identification after initial contact when conducting the final portion of a radar approach"
(JO 7110.65 2-4-8) — the official license for the LSO's callsign-free rapid calls.

**[OBSERVED]** Real fighters compress hard once the net is established. From the NTSB
transcript of the 2015 Moncks Corner F-16 midair:

> "Death four one copies runway heading two thousand this freq" — NTSB ATC Factual Report ERA15MA259AB

### 2.2 Callsign abbreviation

**[OFFICIAL]** Military callsigns are **never** abbreviated, by either party. JO 7110.65 2-4-9
lists under "Do not abbreviate:" — "Aircraft with a military call sign." AIM 4-2-4: "Call
signs should never be abbreviated on an initial contact." Tactical callsign format is
"Pronounceable words of 3 to 6 letters followed by a 1 to 5 digit number" (JO 7110.65 2-4-20) —
"Ghost Eleven" is to-spec (AFI 33-217 lineage: dictionary word + one/two-digit suffix,
number series deconflicted per squadron).

**Number pronunciation — two regimes [OBSERVED, mechanism unconfirmed].** Real traffic shows
both digit-by-digit and group form, and the split appears to track what the number *is*:
formation-positional numbers assigned off the daily schedule are spoken digit-by-digit to keep
the position audible ("Death four one" — NTSB ERA15MA259AB, flight 4 lead), while a **static
squadron slot** — the number as a pilot's standing identity — collapses to group form
(owner testimony, UkrAF-adjacent practice: "I was always Viper eleven"). No pub we could
retrieve writes this rule down; it is community convention, recorded here as observed practice
with the mechanism explicitly unconfirmed. **Catalog ruling:** Rapier pilots fly static
squadron slots → group form throughout ("Ghost Eleven", "Ghost Twelve"). If formation
sorties gain their own R/T, those flights speak digits ("Ghost one two"). The callsign word
never matches the airframe program: the *field* is Rapier (Rapier Tower), the jet is GHOST —
see docs/2026-07-29-callsign-and-pilot-identity.md for the derivation.

**[OBSERVED]** At home fields the gradient is real anyway: full form on first contact with a
new agency, side-number shorthand once established. Navy squadron script at Whiting:
"010, 180, gear down" (VT-6 Contact Supplemental). Intraflight acknowledgment is the single
word "2" (AETCMAN 11-251; AFI 11-2F-16V3 3.15.3: acknowledge "in turn (EXAMPLE: '2, 3, 4')").

**Catalog rule:** the drift from "Rapier Tower, Ghost Twelve, base" to "Tower, Twelve,
final" across takes mirrors reality — but an abbreviated callsign must never carry a
transaction of an ATC clearance.

### 2.3 Readbacks and acknowledgements

**[OFFICIAL]** The rulebook wants far less echo than sims provide:

- Pilots read back **the numbers only** — altitudes, vectors, runway assignments (AIM 4-4-7).
  Model: "November Five Charlie Tango, roger, cleared to land runway nine left."
- The only readback controllers must *enforce* is hold-short (JO 7110.65 2-4-3).
- Everything else: "Acknowledge with your aircraft identification … and one of the words
  'Wilco,' 'Roger,' 'Affirmative,' 'Negative'" (AIM 4-2-3).
- P/CG semantics: ROGER = received all, "should not be used to answer a question requiring a
  yes or a no answer"; WILCO = will comply; OVER = "I expect a response"; OUT = "no response
  is expected." "Over and out" is self-contradictory.

**[OBSERVED]** In every transcript reviewed (NTSB, Tarnak Farm, Gulf of Sidra, Black Hawk
shootdown, balloon shootdown) nobody says "over," "out," or "roger wilco." Real acks take
three forms: "copy/copies" + the operative item ("Copy 'Hinds'" — AWACS, 1994; "Copy. euh.
Disengaging south." — Tarnak Farm BOI); a clipped restatement; or silence-plus-compliance.
The one full readback on any net is a weapons-release order (§3.4).

### 2.4 Numbers

**[OFFICIAL]** Below 18,000 ft: separate digits of the thousands plus hundreds — 12,500 =
"one two thousand five hundred"; round numbers to 9,900 speak naturally, so 2,500 = "two
thousand five hundred" (AIM 4-2-9). Controllers may restate in group form "for added clarity"
(JO 7110.65 2-4-17 NOTE). ICAO digit pronunciation is mandatory — *niner, fife, tree*
(JO 7110.65 Ch. 2 §4, TBL 2-4-1). **Catalog standing note:** any future line containing a 9
must be voiced "niner"; TTS defaults to "nine."

### 2.5 Radio discipline (who speaks at all)

**[OFFICIAL]** "Preface all communications with the complete flight call sign (except for
wingman acknowledgment). Transmit only that information essential for mission accomplishment
or safety of flight. Do not use the radio as a flight 'intercom'." (AFI 11-2F-16V3 para 3.15.)
"Brevity is second only to clarity." (AFMAN 11-248 para 1.17.2.) The chill-pilot
minimum-syllable register is mandated behavior, not just cool.

---

## 3. Per phase

### 3.1 Launch and departure

**The real script.** **[HOUSE]** There is no real-world land-based catapult launch; the
launch character's entire register ("Rapier One One, cleared for launch.") is fiction and is
declared as such. The nearest grounded analogs: arresting-system status appended to a takeoff
clearance — "(Identification), BARRIER/CABLE INDICATES UP/DOWN. CLEARED FOR TAKEOFF/TO LAND."
(JO 7110.65 3-3-6) **[OFFICIAL]** — and the departure check-in:

> "Pensacola Departure, Shooter 010, passing 1500" — VT-6 Contact Supplemental **[OFFICIAL]**

The catalog's "Rapier Tower, Rapier One One, airborne" follows the official callup shape
(facility, full callsign, one fact).

**Delivery.** Pre-stroke clearance is the one call that precedes aviate (README sequencing
table). Post-shot pilot call: settling, one fact, easy.

**Anti-patterns.** Ceremony on departure ("with you," "be advised") — AFMAN 11-248 bans
filler by name.

### 3.2 Overhead pattern

**The real script (USAF flavor).** **[OFFICIAL]** Initial call is bare — callsign +
"initial"; intentions are NOT stated at initial, they ride the gear call. The gear call is
made in the final turn — AETCMAN 11-248 5.8.4.1.4's mnemonic ends "T – Talk (make the gear
down call)" — and 5.8.4.4 defers it until safely established: aviate, navigate, then
communicate. Wording per local SOP; the UPT script (community transcription, **[LORE]**-tier
source for the exact string) is "(Callsign), base, gear down, (no-flap/full stop/departure)."

**The real script (Navy flavor).** **[OFFICIAL]** The VT-10 "Hollywood Script"
(TRARONTENNOTE 3710) scripts the whole recovery:

> "Sherman Tower, KATT 11, Point Golf for the break."
> "KATT 11, report the numbers Runway 7 right."
> "Sherman Tower, KATT 11, numbers 7 right."
> "KATT 11, right break approved" *(pilot reads back: "KATT 11, right break approved.")*
> "Sherman Tower, KATT 11, [abeam, 180, 90, final], gear, stop."
> "KATT 11, wind 080 at 8, Runway 7 Right, cleared to land." *(readback: "KATT 11, cleared to land 7 Right.")*
> "KATT 11, turn right next taxiway, contact ground when clear." *(pilot: "KATT 11, wilco.")*

There is **no self-announced call at the moment of breaking** in any script found — USAF
breaks unannounced in the break zone; Navy gets tower approval and just flies it.

**Controller side.** **[OFFICIAL]** JO 7110.65 3-10-12 / AIM 5-4-27: pattern altitude and
turn direction issued only if nonstandard — "PATTERN ALTITUDE (altitude). RIGHT TURNS.";
"REPORT INITIAL." is an option, not a mandate; break point specified only for traffic —
"BREAK AT (specified point). REPORT BREAK." Published full example:

> "Air Force Three Six Eight, Runway Six, wind zero seven zero at eight, pattern altitude six thousand, report initial." — JO 7110.65 3-10-12
> "Air Force Three Six Eight, break at midfield, report break." — JO 7110.65 3-10-12

Sequencing is done by moving the break point, not by vectoring around the circuit.

**The gear challenge is ritual, not exception.** **[OFFICIAL]** JO 7110.65 2-1-25: "Remind
aircraft to check wheels down on each approach unless the pilot has previously reported wheels
down for that approach." Tower phraseology: **"CHECK WHEELS DOWN."**; approach/GCA: "WHEELS
SHOULD BE DOWN." The pilot's gear call exists to pre-empt the mandatory challenge — which
makes the catalog's omission-trigger *more* rulebook-true, with only the string ("gear" →
"wheels") off.

**Tower reply economics.** **[OFFICIAL]** Routine position reports may get silence:
"All Vance assigned aircraft will continue to make all normal pattern position reports …
though Tower may not respond." (VANCEAFBI 13-204 para 2.1.4.) Tower speaks at gates: break
approval, landing clearance (wind + runway + "cleared to land"), rollout instructions.

**Busy-pattern behaviors, from the cockpit.** **[OFFICIAL]** Carry straight through and call
at the end of the break zone ("Texan 33, break point straight through" — AETCMAN 11-248
5.14.1); breakout first, talk after ("Pistol 2's breaking out" — AETCMAN 11-251); and the
deepest cut — if TOWER directed the carry-through, "aircrew will maintain radio silence and
not call 'break point straight through.'" (14 FTW T-6 In-Flight Guide.)

**Delivery.** Radio calls deferred until "safely established in the turn" — the README's
~2.8 s aviate hold is literally doctrinal. Shortest real calls are two tokens (callsign +
position); no scripted pattern call is one word.

**What sims get wrong.**
- Tower acknowledging every position call (real towers often say nothing back).
- "Three down and locked" on the radio — that lives only in the intercockpit Before-Landing
  checklist; the radio words are "gear down" / "gear" + intentions.
- A dramatic self-announced "breaking!" — exists in no script.
- Landing clearance without wind and runway.
- Continuous verbal vectoring around the circuit — congestion is managed geometrically.
- Full-sentence echo readbacks; filler ("with you," "at this time").

### 3.3 Arrested recovery and the LSO

**The ball call — the pilot's one scripted line of the pass.** **[OFFICIAL]** LSO NATOPS
6.6.3: transmit modex, type aircraft, "Ball", fuel state to the nearest hundred pounds
(spoken as thousands), "Auto"/"Coupled" if applicable. CV NATOPS worked example:

> "301 Hornet ball, five point three, coupled." — NAVAIR 00-80T-105 para 6.4.7.4

As actually spoken **[OBSERVED]**: "Prowler, ball, two point six" (Tailspin's Tales,
EA-6B memoir, grep-verified). "Call the ball" is the **final approach controller's** prompt
(~3/4 mile), never a Paddles line: "2XX, 3/4 of a mile, call the ball" (Air Warriors,
practitioner) **[OBSERVED]**. The LSO answers **"Roger Ball"** — the control handoff,
functionally the landing clearance; there is no FAA-style "cleared to land" on the ball.
No glideslope reference: "the call 'Clara' shall replace the ball call" (LSO NATOPS 6.6.3.4);
LSO answers "Continue." Observed in the wild: "I never saw the ball. I called Clara and the
LSOs said 'continue'…" (Tim Hibbetts via Aviation Geek Club) **[OBSERVED]**. If the ball call
draws no acknowledgment, the pilot must execute his own waveoff (CV NATOPS).

**The LSO's vocabulary is a closed three-tier list.** **[OFFICIAL]** Figure 9-1,
NAVAIR 00-80T-104 — a finite pre-recorded catalog IS the real system:

| Tier | Calls (verbatim) |
|------|------------------|
| Informative | "You're (a little) high.", "You're (a little) low.", "You're lined up left/right.", "You're (a little fast/slow).", "Roger Ball", "Paddles contact." |
| Advisory | "Don't settle.", "Don't climb.", "Don't chase it", "Hold what you've got.", "Fly the ball.", "Easy with it.", "Back to the right/left." |
| Imperative (MANDATORY IMMEDIATE RESPONSE) | "A little power.", "Power.", "Power back on.", "Burner.", "Attitude.", "Bolter.", "Waveoff" / "Waveoff, foul deck.", "Cut.", "Climb.", "Drop your hook.", "Level your wings." |

Key details:
- **Power ladder:** "A little power." → "Power." → "Burner." ("Aircraft is extremely
  underpowered or in extremis"). "Add power" appears only in the pilot *response* column —
  it is never an LSO transmission.
- **Lineup asymmetry:** "(A little) Right for lineup." vs "(A little) Come left." — there is
  **no "Come right."** in the book. The most recognizable LSO idiom after "Roger ball."
- Pilot responses to LSO calls are control inputs, not words. "These commands are mandatory"
  (CNATRA P-1211); a slow response at the ship can disqual.

**Comm density.** **[OFFICIAL]** "Calls that are too frequent or verbose actually degrade
pilot training and performance. Safety of flight requires that pilots receive short meaningful
transmissions that can be instantly understood." (LSO NATOPS 9.3.) A good pass is ball call +
"Roger ball" + silence + trap. **[OBSERVED]** "I never pay attention to them, unless they're
waving me off" (Air Warriors, pilot). Density legitimately rises only in degraded modes
(night, deck motion, emergency talkdown).

**The wire number is never a radio call.** **[OFFICIAL]** It travels the ship's internal 6JG
sound-powered circuit — the phone talker "has the primary responsibility for informing LSOs of
the status of the arresting gear, weight setting, wire run-out, and wire number" (LSO NATOPS
6.6.2.3.a) — and reaches the pilot in the ready-room debrief. Figure 9-1 contains no
post-landing transmission at all. The only pilot voice call after a bolter is "Abeam, with
fuel state after bolter/waveoff." (CV NATOPS 6.4.13.1) — no apology, no ceremony.

**Land-based arrestment (the Rapier case).** **[OFFICIAL]** Rapier's recovery is structurally
FCLP plus field gear — a real thing: "LSO calls during carrier operations are identical to
FCLP LSO calls" (CNATRA P-1211); field LSO qualification requires "Shore-based arresting gear"
(LSO NATOPS 10.2.1). ATC side (JO 7110.65 3-3-6): arresting systems are **retracted for
normal operations** and raised on request; cable status rides a clearance —
"(Identification), BARRIER/CABLE INDICATES UP/DOWN. CLEARED FOR TAKEOFF/TO LAND."; the pilot
emergency request is the **tripled** word: "BARRIER - BARRIER - BARRIER" or
"CABLE - CABLE - CABLE." No official phraseology exists for a tower *announcing* rigged-state.
**[OBSERVED]** When it goes wrong it sounds like plain language: at Kingsley Field (2023) a
single ambiguous "cable" got the tower reply "Cable coming down." and, 7 seconds later, the
pilot's "No, no, I need cable, cable up, cable up, cable up, cable up." (Task & Purpose,
quoting the USAF AIB.) The tripled call is the entire disambiguation mechanism.

**Delivery.** LSO: half-second timing, escalation by word choice *within the card*, never by
improvised phrasing. Note Figure 9-1 lists single "Bolter." / "Waveoff" — the doubled
"bolter, bolter" convention is asserted only by tertiary sources (**[LORE]**, unproven).

**What sims get wrong.**
- Chatty LSO narrating the pass ("looking good… nice").
- Announcing the wire over the radio.
- Paddles saying "call the ball" (that's the approach controller's line).
- Pilot verbally acknowledging LSO calls ("roger, power's in") — responses are stick and throttle.
- Ball calls with tactical callsign, no fuel state, or flourishes ("I have the ball").
- FAA tower ceremony on the ball; "always rigged" cable in every clearance.
- Escalation by shouting or new words — the vocabulary never leaves the card.

### 3.4 Tactical C2 (GCI / AWACS)

**Check-in.** **[OFFICIAL]** Fighter initiates; three transmissions establish the picture
(CNATRA P-1290 sec. 601):

> "Paradise, Rage 11 Mission Number 069 up as fragged, request alpha check Duval"
> "Rage 11, Paradise, radar contact, two good tracks, alpha check Duval XXX/XX"
> "Rage 11 good alpha check, fighters have the environmentals: Sun/Winds/Decks/Altimeter XX.XX"

"If the Alpha Check was good, nothing needs to be said by the wingmen." Wingman silence is
concurrence.

**PICTURE / BRAA.** **[OFFICIAL]** Fighters request with three words ("Paradise, Rage 11,
picture"); AIC answers in fixed element order, no connective grammar — label, group name,
bullseye, altitude, track, declaration, strength:

> "Paradise, single group Duval three one five, thirty, 15 thousand, track South, hostile, two contacts" — P-1290 sec. 604

Note the controller self-identifies **first** in broadcast calls — opposite of ATC
addressing. BRAA is fighter-egocentric on request; the fighter's full acknowledgment of a
BRAA is a bare callsign ("Rage 12"). **[OBSERVED]** AWACS pushes BRAA-shaped warnings
unprompted: "Citgo, pop-up contacts 330 for 8" (Rodriguez, Desert Storm, via TWZ).

**COMMIT flows fighter→controller.** **[OFFICIAL]** "When fighters commit, they are accepting
responsibility to execute an intercept on the picture described by AIC" (P-1290 sec. 409).
**[OBSERVED]** When control *does* direct an engagement, it is a formal order — track data,
declaration, order, time hack, authentication — and it draws the one full readback on any
tactical net. 2023 balloon shootdown, real audio (TWZ):

> "FRANK01 track. Charlie Zulu 535 Bullseye. 0-5-0 15. 64,000. Track east. Hostile. You are ordered to engage."
> "Time is 1905 Zulu. I authenticate Romeo Sierra, use AIM-9Xs"
> "HUNTRESS. FRANK01 engaged. Charlie Zulu 5-3-5 Bullseye. 0-5-0. 15, 64,000." *(shooter's readback)*

**Shot and kill reporting.** **[OFFICIAL]** "There is no reply to this comm; however, it lets
everyone involved know that there are missiles downrange." (P-1290 sec. 606, on the Fox
call.) **[OBSERVED]** The shooter calls the kill; control acknowledges flat or passes the
next threat:

> "FRANK01. Splash one! TOI 1" → "HUNTRESS copy. Splash." — TWZ balloon audio
> Rodriguez's "splash one" (1991) was answered with: "second group north 10" — TWZ

Kill *removal* is a picture change, not praise **[OFFICIAL]** (P-1290 sec. 611):
"Paradise, Single Group vanished" / "Paradise, picture clean" / "Paradise, Single Group
faded, Duval three one zero, twenty-five, fifteen thousand, track South, hostile" (faded =
possibly-alive threat nobody can see).

**Reply economy.** **[OBSERVED]** A hail is answered "Go." ("HUNTRESS. FRANK01. Go.");
JUDY formally silences the controller ("controller will minimize radio transmissions" —
P-1290 glossary); rising stakes are marked by call *cadence* (range countdowns), not emotion.
The engagement closes with a directed weapons-safe roll call:

> "…confirm weapons safe. Roll call." → "FRANK01, switch is safe." / "EAGLE01, weapons safe." — TWZ balloon audio

**Under adrenaline, calls double the word — never add vocabulary.** **[OBSERVED]** 1989 Gulf
of Sidra declassified tape (via Aviation Geek Club): "13 miles. Fox 1! Fox 1!", "Select
Fox 2, select Fox 2!!", "Good kill! Good kill!" — exclamations stay inter-cockpit ("Ah
Jesus!" is labeled inter-cockpit, not radio); the E-2 stays administrative ("Closeout concurs,
showing 78 miles.").

**Good control confirms with independent data; bad control echoes.** **[OBSERVED]** 1994
Black Hawk fratricide: fighter's "Tally two Hinds" answered by AWACS with a bare echo —
"Copy, Hinds" — and 26 died. Contrast 1989: "GYPSY 207 contact at 175, 72 miles, looks like
a flight of two, Angels 10." answered with independent data: "Closeout concurs, showing 78
miles." CONTROL's acks should add a fact, never mirror.

**Plain language is normal on tactical nets.** **[OBSERVED]** Real nets mix brevity with
terse plain English — "We do not have Whiskey 137 plotted. Unfamiliar."; "Euh, request
permission to lay down some 20 mike-mike" (Tarnak Farm BOI, hesitations in the primary
transcript). C2's real power is denial: "Coffee 51. HOLD Fire, I need details on SAFIRE.";
urgency is a two-word imperative: "Scram south!"

**Training rituals.** **[OFFICIAL]** KNOCK-IT-OFF (training use only) is tripled by lead
("Knock it off, knock It off, fighters knock it off") then echoed by name by every
participant ("Bandits Knock It Off", "AIC Knock It Off"…). TERMINATE ends one local
engagement; adversaries *recommend* it ("Bandits recommend terminate"). Never casual, never
live-fire.

**What sims get wrong.**
- Controller as narrator; controller celebrating kills ("Great shot!").
- "Splash the bandit" as a shoot order (SPLASH is a result, called by the shooter).
- Answering everything (Fox calls get no reply; wingman silence means "correct").
- "Bogey" for everything (bogey/bandit/hostile are three distinct weapons-release states).
- All-brevity dialogue — a script made only of codewords reads as a sim, not a cockpit.
- Full-callsign ceremony mid-fight ("…do you copy, over").
- Stress written as new dramatic vocabulary instead of doubled words.

### 3.5 Fuel and weapons state

**[OFFICIAL]** ATP 1-02.1 (07 Mar 2023), Table 2, verbatim:

- "JOKER — \*Fuel state above BINGO at which separation, BUGOUT, or event termination should begin."
- "BINGO — \* Prebriefed fuel state needed for recovery."
- "WINCHESTER — No ordnance remaining."
- "REMINGTON — \*\* [A/A] [A/S] No ordnance remaining except gun or self-protection ammo."

(\* = differs from NATO usage; \*\* = not a NATO brevity word.) JOKER/BINGO are pre-briefed
decision **gates**, not mood words; BINGO is non-negotiable. Fuel in a ball call is spoken as
thousands: "Fuel state reports (thousands of pounds; for example, '3.5')" (CV NATOPS).

**[OBSERVED]** Real gas coordination around the thresholds is compressed plain English, not
brevity: "Whiskey 137 will be your out gas."; "we go back to the tanker for one top-off and
will be back on station in approximately two zero mike" (TWZ balloon audio). No verbatim
primary example of a "say state / state 5.2" exchange was found (§6).

**RTB's odd status.** **[OFFICIAL]** RTB appears in ATP 1-02.1 only in Table 3, "Standard
Tactical Chat Abbreviations" ("RTB — return to base") — a text-chat term, not a Table 2 voice
code. The voice term for the destination is "HOME PLATE — Home airfield or ship." So
"RTB home plate" says return-to-*base* home-*airfield* twice.

**Delivery.** Bad news in real recordings is flat and short — the Shaw AFB mishap pilot's
gear status was "no green lights" and his self-assessment "no excuse" (USAF AIB, Shaw,
30 Jun 2020) **[OBSERVED]**. The catalog's "tighter, flatter, composure held on purpose"
direction matches the tape. Note real *emergencies* then get long and conversational —
checklists read over the air, ~30 minutes of plain sentences — brevity is for the fight,
not the crisis.

---

## 4. Brevity glossary — as actually defined

All from ATP 1-02.1 / AFTTP 3-2.5 (07 Mar 2023), Table 2, unless noted. **[OFFICIAL]**

| Word | Definition (verbatim) | Catalog usage |
|------|----------------------|---------------|
| GUNS | "[A/A] [A/S] Aircraft gun is being employed." | ✅ used for its defined event |
| FOX [number] | "[A/A] Simulated or actual launch of air-to-air weapons. (ONE): Semi-active radar-guided missile. (TWO): IR-guided missile. (THREE): Active radar-guided missile." | ✅ "Fox Two" = IR, correct |
| SPLASH(ED) | "1. [A/A] [A/S] [S/A] Hit observed with valid DWE against a target." | ✅ shooter-called result |
| JOKER | "\*Fuel state above BINGO at which separation, BUGOUT, or event termination should begin." | ✅ |
| BINGO | "\* Prebriefed fuel state needed for recovery." | ✅ |
| WINCHESTER | "No ordnance remaining." | ✅ |
| REMINGTON | "\*\* [A/A] [A/S] No ordnance remaining except gun or self-protection ammo." | ✅ (US-only, not NATO) |
| COMMIT | "1. \* [A/A] Intercept the GROUP(S) of interest. 2. \* [A/A] Set briefed intercept geometry." | ⚠️ defined, but doctrinally the *fighters'* act (§3.4) |
| SEPARATE(ING) | "[A/A] Leave(ing) a specific engagement; may or may not reenter." | ✅ covers "Rapier One One, separating." |
| HOME PLATE | "Home airfield or ship." | ✅ (voice term; pairs awkwardly with RTB) |
| JUDY | "Aircrew has taken control of the intercept…; controller will minimize radio transmissions." (P-1290 glossary) | not in catalog; useful |
| BOGEY DOPE | "Request for information on indicated or closest GROUP in BRAA format." (P-1290 glossary) | not in catalog |
| RTB | Table 3 chat abbreviation only: "RTB — return to base" | ⚠️ spoken in practice, but not a voice brevity code |

**Catalog terms with NO official definition anywhere opened** (grep-verified absent from
ATP 1-02.1, AIM 4-2/4-4/5-4, JO 7110.65 chapters pulled, AFMAN 13-204v3, LSO NATOPS)
**[HOUSE]**: "Drone away", "3 greens", "gear to come", "Land (callsign)", wire-number radio
calls, "mission complete", "arresting gear rigged", "bolter" as a *tower* call ("Bolter"/
"Waveoff" are official as LSO calls only). "3 green" does appear as the term of art in the
Shaw AIB — but as an intercockpit/report term, never shown keyed on a frequency **[OBSERVED]**.

---

## 5. Sources

**Primary (official publications — opened and extracted):**

| Source | URL | Reliability |
|--------|-----|-------------|
| FAA JO 7110.65BB (2-1-24/25, 2-4-3/8/9/17/20, 3-3-6, 3-10, 3-10-12) | faa.gov/air_traffic/publications/atpubs/atc_html/ | primary |
| FAA AIM 4-2, 4-4-7, 5-4-27; Pilot/Controller Glossary | faa.gov/air_traffic/publications/atpubs/aim_html/ | primary |
| ATP 1-02.1 / AFTTP 3-2.5 Multi-Service Brevity Codes, 07 Mar 2023 | irp.fas.org/doddir/army/atp1-02-1.pdf | primary |
| NAVAIR 00-80T-104 LSO NATOPS (May 2009 public copy) | info.publicintelligence.net/LSO-NATOPS-MAY09.pdf | primary |
| NAVAIR 00-80T-105 CV NATOPS (Jul 2009 public copy) | info.publicintelligence.net/CV-NATOPS-JUL09.pdf | primary |
| AFI 11-2F-16V3 (1 Jul 1999 — superseded edition) | bits.de mirror | primary (dated) |
| AFMAN 11-248 (2006 + 2011 excerpts), AETCMAN 11-248 (1 Oct 2024), AETCMAN 11-251 | vitaf.it / NTSB docket / e-publishing via Wayback | primary |
| TRARONTENNOTE 3710 "Hollywood Script" (VT-10), VT-6 Contact Supplemental, CNATRA P-764 | cnatra.navy.mil via Wayback | primary |
| VANCEAFBI 13-204 (12 Nov 2024); 14 FTW T-6 In-Flight Guide (Jul 2020); AFMAN 13-204V3 | e-publishing / columbus.af.mil via Wayback | primary |
| CNATRA P-1290 Fundamentals of Fighter Intercepts (Jul 2022) | xbradtc3.com/wp-content/uploads/2022/11/p-1290.pdf | primary |

**Primary (recordings / mishap transcripts):**

| Source | URL | Reliability |
|--------|-----|-------------|
| NTSB ATC Factual Report ERA15MA259AB (2015 Moncks Corner F-16 midair) | data.ntsb.gov docket | primary |
| Tarnak Farm Board of Inquiry radio-transcript analysis | globalsecurity.org mirror | primary |
| USAF AIB, F-16CM 94-0043, Shaw AFB, 30 Jun 2020 | airandspaceforces.com mirror | primary |
| TWZ: balloon-shootdown moment-by-moment audio (HUNTRESS/FRANK01), quotes grep-verified | twz.com | primary |

**Strong secondary:**

| Source | URL |
|--------|-----|
| Aviation Geek Club: 1989 Gulf of Sidra declassified tape transcript; 1994 Black Hawk shootdown calls (quoting Davies); Hibbetts Clara account | theaviationgeekclub.com |
| TWZ: Rodriguez Desert Storm account; Su-22 shootdown definitive account (confirms no public R/T) | twz.com |
| Task & Purpose: Kingsley F-15 cable mishap (quoting AIB) | taskandpurpose.com |
| Air Warriors forum "world of Paddles" thread (practicing LSOs/pilots) | airwarriors.com |
| Tailspin's Tales "Roger Ball" (EA-6B memoir, grep-verified) | tailspinstales.blogspot.com |
| Wikipedia 1994 Black Hawk shootdown (cited to Snook/Piper, grep-verified) | en.wikipedia.org |
| pointSixtyFive JO 7110.65 mirrors (2-1-25, 3-10-12, 3-3-6) | pointsixtyfive.com |

**Weak / [LORE]:** Brainscape UPT radio-call flashcards (community SOP transcription);
Pilots of America mic-double-click threads; Wikipedia "Bolter" repetition claim (unopened);
Skyhawk Association LSO article; CNATRA P-1211 tpub excerpts (edition unverified — treated
as strong-secondary for the FCLP-identity quote).

---

## 6. Named gaps — what this research could NOT ground

1. **AETCI 11-204 (RSU operations)** — the pub that standardizes exact USAF pattern call
   wording — unretrievable. The base-leg gear-call *requirement* is verified; its official
   *string* is not (rests on a community flashcard deck).
2. **Current-generation AFMAN 11-2F-16V3** — e-publishing blocked; radio-discipline quotes are
   from the superseded 1999 AFI (doctrine corroborated stable by 11-248).
3. **No real recording of an overhead at an operational fighter base** — every pattern
   verbatim is a scripted training document. Delivery, pacing, and clipping under G in the
   pattern set rest on inference, not tape.
4. **Wire-number and rigged-gear radio calls** — no source anywhere voices a wire to the
   pilot or announces gear rigged; wire is an internal 6JG datum. The catalog's wire lines are
   unsupported. No official phraseology for announcing cable readiness exists; observed
   practice is improvised plain language ("Cable coming down." — Kingsley AIB).
5. **Doubled/tripled urgent LSO delivery** ("Wave off, wave off", "Bolter, bolter") — Figure
   9-1 lists single forms; the repetition convention is plausible-but-unproven (tertiary only).
6. **LSO cadence timing** — the 0.45 s hold rests on secondary description; no measured
   PLAT-tape or timed transcript of a real pass was obtainable. "Paddles Monthly" could not
   be found; treat any quotation from it as unverifiable.
7. **"3 greens", "gear to come", "Land (callsign)", "Drone away", "mission complete"** — no
   primary source shows any of them keyed; declared house style ([HOUSE]), never to be
   documented as AIM/AFTTP-grounded.
8. **Land-based catapult launch phraseology** — no real-world analog exists; the launch
   character is fiction by declaration.
9. **Tactical fuel-state queries** ("say state" / "state 5.2") — no verbatim primary example
   found; the exchange shape is unsourced.
10. **Modern USN A/A employment R/T** — 2017 Su-22 tapes remain classified; the 1989 Sidra
    tape carries the whole load. **Mic double-click ack** — practitioner forum testimony only
    ([LORE]).
11. **2025 brevity signature draft** unretrievable; definitions rest on the signed Mar 2023
    edition. ATP-specific nuances beyond the P-1290 glossary reproduction are unverified.
12. **cnatra.navy.mil DNS-blocked; TW-5 FWOP voice-procedures appendix has no text layer** —
    exact Whiting initial-call wording unverified. Extracted source texts preserved at
    `/private/tmp/claude-501/-Users-iantodd-Projects-guns-only/c56ddb09-a8aa-415e-8e49-a121df3120e7/scratchpad/`.

---

## 7. Catalog recommendations (gap analysis, grouped by verdict)

Implementation coupling notes (MissionRadio.cs switch strings, dual control-commit emission
sites, QueuePlayerLeg interpolation, caption/clip regeneration) are recorded at the end.

### KEEP (grounded or deliberately-declared house style)

| Line | Text | Basis |
|------|------|-------|
| `lso-low` / `lso-high` / `lso-come-left` / `lso-power` | "You're low." / "You're high." / "Come left." / "Power." | Verbatim Figure 9-1 — exactly right; untouched |
| `pilot-splash` | "Splash one." | Matches "FRANK01. Splash one!"; dry, shooter-called, no celebration |
| `pilot-land` | "Land Rapier One One." | Deliberate deviation: clipped restatement acks are observed practice; AIM would want the runway |
| `pilot-base-gear-unsafe` | "…gear to come." | Register matches Shaw AIB flat bad-news ("no green lights"); exact phrase is [HOUSE] |
| `traffic-*-final-alt` | "Tower, One Two, final." | Breaks JO 2-4-9 on purpose; home-field side-number gradient is real. Never on a clearance transaction |
| `pilot-drone-away` | "Drone away." | [HOUSE] for a fictional weapon; idiom-adjacent ("Bomb's away," Tarnak). Never cite as AFTTP |

### REWORD

| Line | From → To | Basis |
|------|-----------|-------|
| `pilot-initial` | "…initial, full stop." → "Rapier One One, initial." | Intentions never ride the initial call; move "full stop" to base |
| `pilot-base` | "…base, 3 greens." → "Rapier One One, base, gear down, full stop." | Scripted gear call = position + "gear down" + intentions; "3 greens" unsourced as R/T |
| `pilot-downwind` | "…3 greens." → "…gear down." | VT-6 / AETCMAN "gear down" token |
| `pilot-checklist-recovery-config` | "…3 greens." → "…gear down." | Same; closes the JO 2-1-25 wheels-check waiver loop |
| `tower-check-gear-downwind` | "check gear down" → "check wheels down" | JO 7110.65 2-1-25 exact string; keep the omission trigger |
| `tower-continue-check-gear` | "…check gear down" → "…check wheels down" | Same; third rung if ever needed re-issues with "immediately" |
| `tower-cleared-arrested-landing` | "…Arresting gear rigged." → "Rapier One One, cable indicates up, cleared to land." | JO 3-3-6 official template; "rigged" exists in no pub |
| `traffic-*-base-alt` (×3) | "…3 greens." → "…gear down." | Same gear-token finding |
| `tower-trap-wire-1` | "wire one, hold position" → "Rapier One One, hold position." | Wire never rides the radio (6JG circuit); hold/rollout is real tower content. Collapse wires 1–4 |
| `lso-bolter` | "Bolter, bolter." → "Bolter." | Figure 9-1 single form; doubling unproven. If kept for audibility, document as deviation |
| `lso-waveoff` | "Wave off, wave off." → "Waveoff." | Same Figure 9-1 finding |
| `tower-waveoff-gear` | → "Rapier One One, go around. Gear unsafe." | "Waveoff" is LSO-only vocabulary; alternative: move the emission to the LSO voice |
| `tower-bolter` | → "Rapier One One, go around." | "Bolter" is in no FAA/USAF pub as a tower call; or route to `lso-bolter` |
| `lso-add-power` | "Add power." → "A little power." | "Add power" is the pilot response column, never a transmission; completes the ladder with `lso-power` + new `lso-burner` |
| `lso-fast` | "Fast." → "You're fast." | Figure 9-1 informative framing |
| `lso-come-right` | "Come right." → "Right for lineup." | The official asymmetry; no "Come right." exists |
| `control-commit` | "…commit." → "Rapier One One, hostile. You are ordered to engage." | COMMIT is the fighters' act; directed engagement is a formal order (HUNTRESS shape). Alt: keep "commit" in the pilot's mouth |
| `control-mission-complete` | → "Rapier One One, confirm weapons safe." | "Mission complete" has no tactical-net analog; real close is the weapons-safe roll call. Pairs with new `pilot-switch-safe` |
| `pilot-rtb` | "RTB home plate" → "Control, Rapier One One, RTB." | "RTB home plate" doubles one meaning (Table 3 + Table 2) |
| `control-bingo-rtb` | "RTB home plate" → "Rapier One One, RTB." | Same; keep the cold administrative delivery |

### CUT

| Line | Basis |
|------|-------|
| `pilot-break` ("Rapier One One, breaking.") | No script contains a self-announced break; replaced by tower approval (below) |
| `tower-trap-wire-*-relaunch` (×4) | Once wire leaves the radio, the relaunch variant has no content; post-trap silence is grounded |
| `lso-wire-1..4` | Figure 9-1 has no post-landing call; README's "Wire final stays silent" already half-commits |
| `pilot-checklist-gear-up` ("Gear up.") | Fails AFI 11-2F-16V3 "not a flight intercom" + the catalog's own audience filter; ANCA carries it |

### ADD

| New line | Text / direction | Basis |
|----------|------------------|-------|
| `tower-break-approved` | "Rapier One One, left break approved." — matter-of-fact gate call | Navy flow ("KATT 11, right break approved"); the sourced replacement for the cut break call |
| `tower-break-at-midfield` | "Rapier One One, break at midfield, report break." — busy pattern only | JO 3-10-12 published example; "the single most authentic congestion lever" |
| `pilot-ball` | "Rapier One One, ball." — one scripted line of the pass, easy and exact | The most iconic recovery beat, currently missing. Real call carries modex/type/fuel — fuel is dynamic, so declared deviation; ANCA carries the state |
| `lso-roger-ball` | "Roger ball." — calm, immediate; the control handoff = the landing clearance | Figure 9-1; also grounds the pilot's own-waveoff duty on silence |
| `lso-burner` | "Burner." — top of the ladder, in extremis, still on the card | Figure 9-1; Rapier has burner, so the top rung is free and grounded |
| `pilot-check-in` | "Control, Rapier One One, up as fragged." — administrative, one breath | P-1290 sec 601; the most recognizable GCI shape, absent from the catalog |
| `control-radar-contact` | "Rapier One One, radar contact." — measured, flat, done | P-1290 sec 601 reply; establishes CONTROL in two words |
| `control-picture-clean` | "Control, picture clean." — flat; nothing left on sensors is the whole message | P-1290 sec 611; colder than praise, and the natural RTB trigger |
| `pilot-switch-safe` | "Rapier One One, switch is safe." — adrenaline draining, flat compliance | Verbatim shooter reply from the balloon-shootdown roll call |

### REDIRECT DELIVERY

| Line | Rule |
|------|------|
| `pilot-fox-two` (also `pilot-guns`, `pilot-splash` takes) | Existing takes stay micro-timing variants only. A high-stress variant must be a NEW line id with text "Fox Two, Fox Two." — stress doubles the word, never adds vocabulary; captions mirror clips |

### Director / implementation notes (from gap analysis, condensed)

- LSO rewording is a multi-surface change: `ObserveLso` in `sim/MissionRadio.cs` switch-matches
  the advisor's literal strings ("COME RIGHT", "ADD POWER NOW", "FAST"); advisor strings, the
  switch, and the HUD path (`Lso.AdviseForMode` re-run in `UpdateMissionRadio`) must move in
  one commit or the radio silently stops firing. New `lso-burner` needs an advisor severity
  between POWER and WAVE OFF.
- `control-commit` is emitted from two sites (tick-0 attach branch in `Observe()` and the
  phase-transition case in `ObserveTacticalMission()`); update both.
- Cutting `pilot-break` empties the BREAK case in `QueuePlayerLeg`; `tower-break-approved`
  fires on the INITIAL leg (approval precedes the maneuver), with the 1.5 s tower hold.
- Moving "full stop" to base changes two interpolated strings in `QueuePlayerLeg`; texts,
  clips, and captions regenerate together.
- Ball call needs a new emission site in the deliberately-silent SHORT_FINAL/WIRE_FINAL gap;
  `tower-waveoff-gear` preempt must still outrank both; `lso-roger-ball` uses the 0.45 s hold.
- Weapons-safe pair replaces mission-complete in `ObserveEvents`' Victory branch; existing
  FIFO earliest-time chaining sequences the reply behind the query.
- Keep two validated silences exactly as coded: no tower reply to traffic base/final calls
  (VANCEAFBI: "though Tower may not respond") and no reply of any kind to Guns/Fox/Splash
  (P-1290: "There is no reply to this comm").
- Gear-challenge trigger logic (challenge only when the gear word is omitted) is rulebook-true
  per JO 2-1-25's waiver; change only the wording, never the trigger.
- Wire removal collapses `ObserveRecovery`'s four-way wire clamp to one hold-position call (or
  silence on relaunch); wire surfaces on the ANCA panel/debrief instead.
- Cadence tuning (optional): recordings show bursty clustering — tighten inter-call gaps
  inside event clusters, lengthen idle-phase dead air; encode escalation as increasing CONTROL
  call *frequency*, never vocal drama.
