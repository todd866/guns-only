# Modern visual merge thin slice

Mission 7 is a continuous guns-only fight: an F-22A public-data surrogate meets successive Su-27S
public-data surrogates in offset reciprocal merges, beginning near 18,000 ft. Guns remain inhibited
until the first pass of every engagement is complete. Each splash opens a short destruction dwell,
then a new opponent enters without replenishing ownship fuel, ammunition, or damage. The previous
wreck keeps its entity identity and continues through fixed-step failed-flight, impact, and
settlement physics after leaving the combat-target slot.

“Post-BVR” is scenario background only. This slice does **not** simulate or imply radar, stealth,
missiles, RWR, datalink, exact modern flight-control laws, or classified data. It does represent the
F-22's public two-dimensional pitch-thrust-vectoring capability as a bounded reduced-order
force/moment allocator; that narrow capability must not be mistaken for an OEM control-law model.
The external bodies remain abstract contact presentations until useful, reviewed silhouettes exist;
the app does not display a Sabre model and call it an F-22.

## Public anchors and surrogate boundary

- [USAF F-22 fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/): public weight, wing, fuel, load-limit, engine-thrust-class, two-dimensional thrust-vectoring nozzles, and armament anchors.
- [NASA/TM-2008-215112](https://ntrs.nasa.gov/citations/20080012497): public ±20-degree F-22 pitch-vectoring anchor.
- [USAF M61A2 installation caption](https://www.holloman.af.mil/News/Photos/igphoto/2000165167/): installed gun and ammunition capacity anchor.
- [Ukrainian state export Su-27 catalogue](https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf): public Su-27 family dimensions, weights, thrust class, and installed gun anchor.

The lift/drag polars, inertias, lateral derivatives, military/afterburner split, spool constants,
fuel-flow anchors, ballistic dispersion proxy, and damage radii are rounded **public-data
surrogates**. Their identifiers retain that label in simulation, snapshot, presence, and telemetry
contracts. They are tuned only enough to make a physically coherent visual-fight exercise; they
must not be cited as aircraft performance data.

The afterburning-turbofan surrogate uses a bounded `sqrt(density ratio)` thrust lapse with modest
Mach ram recovery instead of the legacy linear-density generic thrust rule. Regression tests require
both aircraft to retain a bounded 18,000-ft lapse and gain specific energy at full afterburner.

The pitch-vectoring model resolves both the canted thrust force and its pitching moment about a
labelled surrogate CG-to-nozzle resultant arm. It schedules into the same alpha/rate loop as the
aerodynamic controls only as the wing separates; attached flow remains fixed-nozzle. Releasing a
high-alpha Space override captures a 1-G envelope-recovery command even if Up remains held, and a
fresh neutral pull boundary is required before protected max-performance pull re-arms. This prevents
the former failure where release settled indefinitely at the lift break and felt like a stuck AoA
override. The lever arm and allocator gains are gameplay surrogates, not published F-22 data.

Once guns are hot, a pitch-only gameplay aid can converge the gun line on the existing ballistic
lead solution inside an eight-degree, 1 km acquisition gate. It requests no more than 17 deg/s and
subtracts measured body pitch rate before converting the residual into no more than 3 G of
protected command augmentation. It cannot roll into plane, manage
closure, acquire a target outside that gate, or press the trigger; an explicit pitch/alpha override,
high-alpha recovery, loss of control authority, or aircraft-owned Auto-GCAS takes precedence. These
limits are player-assistance tuning, not a representation of an F-22 production fire-control law.

## Decision evidence

The evaluator records, rather than invents:

- first-pass completion and minimum merge separation;
- minimum IAS and an explicit 300 KIAS energy floor;
- trigger presses while guns are safe or outside a valid rear-quarter solution;
- close-range closure and overshoots only after ownship establishes offensive pursuit geometry
  behind the opponent (the compulsory reciprocal-pass closure is never scored as a pilot error);
- valid rear-quarter dwell; and
- actual rounds and swept projectile hits from each aircraft's selected gun profile.

The per-engagement score is a compact teaching aid, while kill count and resources remain cumulative
across the sortie. It is not a substitute for the physical result. A held trigger during any safe
phase is interlocked; the pilot must release it before the gun can fire after that merge.

## Presentation and multiplayer contract

Mission, aircraft, systems, and gun identity are owned by `BeatSetup`, rather than inferred from a
hard-coded mission-index switch in the web bridge. The world server allowlists the explicit F-22A
surrogate presentation ID and pins it for a connection exactly like the existing aircraft contracts.
Modern gear, flap, electrical, and hydraulic systems are marked not simulated, so the browser does
not expose the internal F-86 compatibility object as modern-aircraft truth. The simulation rejects
configuration-system inputs for this capability and forces its effective aerodynamic configuration
clean, preventing invisible F-86 gear/flap lift or drag.
