# Auto-GCAS training surrogate

Guns Only models automatic ground-collision avoidance as an aircraft capability, not as a generic
anti-crash rule and not as a detector for pilot unconsciousness. It is currently available only to
the F-22A public-data surrogate used by the modern visual-merge and drone-defence sorties. Korea-era
aircraft do not acquire it through the renderer or mission menu.

## Authoritative path

At 120 Hz, `AutoGcasController` compares two bounded fast-time trajectories against the same
authoritative terrain surface used for radar altitude, collision, wreck motion, rendering and the
multiplayer world frame:

1. the effective pilot-control path, after physiological delay/degradation or G-LOC control
   release; and
2. a roll-upright and fly-up recovery path.

Every predicted motion segment is swept against terrain at no more than five-metre horizontal
spacing (and more finely where the terrain contract requires it), so a ridge between the 0.1-second
trajectory states cannot alias as clear.

The public-data calibration uses an 8-second prediction horizon, a 30 ft terrain-model plus 15 ft
trajectory buffer, approximately 150 degrees/second roll toward upright, a 30-degree bank gate, and
an envelope-protected command of up to +5 G. A warning becomes eligible before the last-instance
boundary; automatic recovery requires a predicted buffered terrain violation and no more than 1.5
seconds of time available before the recovery becomes ineffective.

Those numbers are an inspectable training surrogate based on public F-16/F-22-family material. They
are not a representation of classified F-22 operational-flight-program logic.

## Activation, inhibit and release

- Safe flight remains armed and contributes no controls, graphics or sound.
- An active fly-up rolls toward wings level, retains the pilot's throttle position, neutralizes
  rudder, and commands +5 G only inside the bank gate. The aircraft flight-control/envelope model
  remains the authority for achievable G.
- Guns are inhibited during an automatic fly-up.
- The recovery releases only after a continuous one-second safe-climb dwell with both present and
  predicted clearance margins.
- `K` is a held paddle override on capable aircraft. It is ignored when the pilot lacks useful
  control authority, and every active override is counted for debrief.
- Below the public 250 KCAS procedural boundary, a new recovery is inhibited. If speed crosses that
  boundary during an active recovery, the bounded envelope-protected recovery continues instead of
  silently handing an imminent collision back to the pilot.
- Missing terrain prevents a new activation. Loss of terrain data during a commanded recovery is
  fail-operational: the recovery continues on the last valid prediction until a normal safe release
  or pilot paddle override.

## G-LOC and blackout

Auto-GCAS never activates because a pilot is unconscious. It activates only when the projected
aircraft path threatens terrain. Pilot physiology and aircraft recovery are independent state
machines:

- G-LOC releases the pilot's controls and interlocks the gun;
- Auto-GCAS may then see that effective hands-off trajectory and intervene if it threatens terrain;
- the actual roll and +G recovery pass through `AircraftSim` and feed back into the same retinal and
  cerebral resource model; and
- blackout, absolute incapacitation and cognitive/control recovery continue on their physiological
  time scales. Auto-GCAS does not restore sight or consciousness.

The visual layer remains absent in normal flight. It shows only a qualified warning or active
fly-up, and its attention tone is suppressed during modeled unconsciousness. The debrief records
activation and paddle counts but does not infer distraction, G-LOC or pilot error from an
intervention alone.

## Public reference anchors

- [Current F-22 operating procedures (AFMAN 11-2F-22A V3)](https://static.e-publishing.af.mil/production/1/af_a3/publication/afman11-2f-22av3/afman11-2f-22av3.pdf)
- [Air Force Test Center F-22 Auto-GCAS flight-test history](https://www.aftc.af.mil/News/On-This-Day-in-Test-History/Article-Display-Test-History/Article/2225358/july-18-2013-sky-automatic-ground-collision-avoidance-system/)
- [NASA fast-time recovery-trajectory implementation](https://ntrs.nasa.gov/api/citations/20150014106/downloads/20150014106.pdf)
- [NASA/USAF pilot-interaction and nuisance-activation study](https://ntrs.nasa.gov/api/citations/20140011822/downloads/20140011822.pdf)
- [USAF account of an Auto-GCAS recovery during G-LOC](https://www.acc.af.mil/News/Article-Display/Article/1026196/point-of-recovery-ground-collision-avoidance-system-saving-pilots-lives/)

## Deliberate limits

- Navigation covariance, terrain-database confidence classes and exact operational inhibit logic
  are not public and are represented only by explicit validity and buffer guards.
- The predictor is a deterministic point-mass fast-time model; the authoritative six-degree flight
  simulation, not the predictor, determines what the aircraft actually does.
- There is no damage, maintenance or fault tree for the system yet.
- The current implementation owns one terrain surface rather than fused radar/radio-altimeter and
  digital-terrain channels.
- Intervention history currently retains counts and live prediction state, not a dedicated
  per-activation evidence packet. The incident replay and telemetry remain the detailed evidence.
