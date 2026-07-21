# Pilot G physiology

Guns Only models pilot G tolerance as deterministic physiological state, not as an aircraft G
limiter or an instantaneous blackout threshold. The aerodynamic envelope, structural consequences,
and the human response remain separate systems.

## Authoritative input

`AircraftSim.LastPilotNormalAccelerationG` is the pilot's signed head-to-foot normal specific
force. It is calculated from the complete non-gravitational force acceleration (aerodynamic,
propulsive, and side force) projected onto body up. `LastNz` remains the legacy wing-lift load
factor and is not used as a substitute for pilot-seat G.

This distinction matters in slow-speed high-alpha manoeuvres: an 11 G stick demand or a 60-degree
alpha command does not manufacture 11 G of physiological exposure. External contact integrators
must publish their occupant force explicitly; otherwise the bridge marks `pilot_gz_valid` false and
the physiology integrator uses a documented neutral 1 G support assumption.

## Model

`PilotPhysiologyModel` runs at the 120 Hz authoritative simulation rate. It carries independent
retinal and cerebral resource banks, transient rapid-onset debts, negative-G burden, push-pull
history, anti-G technique engagement, and recovery state. Installed equipment, pilot constitution,
and learned technique are separate replaceable profiles attached to the mission actor rather than
hidden inside aircraft coefficients.

The model produces continuous vision, consciousness, cognition, response delay, and control
authority outputs. When consciousness is lost, physics continues, the stick and rudder return to a
hands-off state, the throttle lever stays where the pilot left it, spring-loaded cockpit actions
release, active anti-G straining decays on its physiological time constant, and the gun is
interlocked. New pilot actuator inputs are rejected until useful function returns; held browser
input cannot automatically reapply a maximum-G pull or resume firing on recovery.

The renderer consumes only the authoritative outputs. In normal flight it adds nothing to the
screen. Decision-relevant impairment progressively narrows or removes vision and supplies a short
unload/recovery cue. G-LOC count, peak signed G, onset, cumulative exposure, protection state, and
recovery are recorded automatically in sortie telemetry.

## Reference calibration

The current profiles are transparent public-data training surrogates:

| Case | Guard |
| --- | --- |
| Protected experienced modern pilot, +9 G for 15 s | conscious, control normal |
| Same pilot, +11 G for 2 s | conscious, impaired but recoverable |
| Same pilot, +11 G for 5 s | conscious, severe depletion |
| Same pilot, sustained +11 G | G-LOC at about 7.4 s in the reference case |
| Unprotected reference pilot, +6 G for 4 s | G-LOC |
| −2.5 G for 4 s | red-out and persistent push-pull penalty |
| Post-G-LOC | retinal recovery is faster than cerebral/control recovery |

These are population/reference anchors, not a medical prediction for a particular person. The
calibration and architecture draw on the FAA CAMI G-Effects Model, USAF centrifuge research, and
published G-LOC incapacitation/recovery studies:

- [FAA CAMI G-Effects Model technical report](https://www.faa.gov/sites/faa.gov/files/OAM202306.pdf)
- [FAA CAMI model user guide](https://www.faa.gov/data_research/research/med_humanfacs/oamtechreports/media/OAM202305_0.pdf)
- [USAF relaxed and straining +Gz tolerance](https://pubmed.ncbi.nlm.nih.gov/3355460/)
- [Combined anti-G protection in experienced subjects](https://pubmed.ncbi.nlm.nih.gov/17484342/)
- [G-LOC incapacitation duration](https://pubmed.ncbi.nlm.nih.gov/2357157/)
- [Performance before and after G-LOC](https://pubmed.ncbi.nlm.nih.gov/16696261/)

## Deliberate current limits

- Pilot-seat rotational acceleration (`alpha × r` and `omega × (omega × r)`) is not yet added; the
  present measurement is at the aircraft centre of gravity.
- Individual variation, injury, hypoxia, dehydration, heat, illness, long-duration fatigue, and
  G-LOC motor phenomena are not yet parameterized.
- Structural fatigue and over-G inspection consequences remain a separate future model.
- Catapult, arrestment, and impact models do not yet publish full three-axis occupant loads.
- The modern aircraft and protection profiles are public-data surrogates, not classified system
  representations.

Those gaps are explicit so later maintenance-test-flight and human-performance scenarios can add
complexity without rewriting the flight model or presentation contract.
