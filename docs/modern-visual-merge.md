# Modern visual merge thin slice

Mission 7 is a straightforward guns-only fight: an F-22A public-data surrogate meets a Su-27S
public-data surrogate at an offset reciprocal merge near 18,000 ft. Guns remain inhibited until the
first pass is complete. After that, the ordinary fixed-step aircraft, reactive opponent, projectile,
damage, impact, and sortie-outcome models decide what happens.

“Post-BVR” is scenario background only. This slice does **not** simulate or imply radar, stealth,
missiles, RWR, datalink, exact modern flight-control laws, thrust vectoring, or classified data.
The external bodies remain abstract contact presentations until useful, reviewed silhouettes exist;
the app does not display a Sabre model and call it an F-22.

## Public anchors and surrogate boundary

- [USAF F-22 fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/): public weight, wing, fuel, load-limit, engine-thrust-class, and armament anchors.
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

## Decision evidence

The evaluator records, rather than invents:

- first-pass completion and minimum merge separation;
- minimum IAS and an explicit 300 KIAS energy floor;
- trigger presses while guns are safe or outside a valid rear-quarter solution;
- close-range closure and overshoots only after ownship establishes offensive pursuit geometry
  behind the opponent (the compulsory reciprocal-pass closure is never scored as a pilot error);
- valid rear-quarter dwell; and
- actual rounds and swept projectile hits from each aircraft's selected gun profile.

The score is a compact debrief aid, not a substitute for the physical sortie result. A held trigger
during the safe phase is interlocked; the pilot must release it before the gun can fire after the
merge.

## Presentation and multiplayer contract

Mission, aircraft, systems, and gun identity are owned by `BeatSetup`, rather than inferred from a
hard-coded mission-index switch in the web bridge. The world server allowlists the explicit F-22A
surrogate presentation ID and pins it for a connection exactly like the existing aircraft contracts.
Modern gear, flap, electrical, and hydraulic systems are marked not simulated, so the browser does
not expose the internal F-86 compatibility object as modern-aircraft truth. The simulation rejects
configuration-system inputs for this capability and forces its effective aerodynamic configuration
clean, preventing invisible F-86 gear/flap lift or drag.
