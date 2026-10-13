# Opponent gunnery under true hit volumes

C12 restores modern visual-merge opponents' fixed-gun tracking after C10 removed the
forgiving spherical hit volume. C11's player gimbal is unchanged. A round still has to
intersect the moving airframe solids; damage, dispersion, muzzle speed, collision
geometry, aircraft limits and opponent gun mounting are unchanged.

`SimulationSession.ConfigureAdaptiveAiPlanning` supplies each opponent's actual
`GunProfile` only for the modern visual-merge route with true target geometry. Arena
handicaps and the first-run valley retain the legacy controller. Other missions are
not opted in. `NeutralMergeBandit` forwards the profile when it creates its fighting
actor. Direct duel/funnel acceptance harnesses configure the enemy in the same way;
their reference opponents remain the existing ruler.

## Tracking and trigger policy

- Aim at the observed target body origin, which lies inside the F-22 fuselage. No
  hypothetical sphere boundary is used as an aim point.
- Start with `GunKill.EvaluateBallisticLead`: actual fixed muzzle position, inherited
  shooter velocity, selected muzzle speed, flight-time limit and projectile gravity.
  Estimate acceleration from successive `ActorObservation` velocities, with a 0.15 s
  smoothing constant and a 12 g outlier cap. These are authored controller policy,
  not measured aircraft capabilities or changes to actual target acceleration.
- Refine the constant-acceleration intercept with three bounded Newton steps.
  Accept only a finite root within the projectile lifetime, within 50% of the initial
  root, and with at most 1 cm distance residual. Otherwise retain the shared solver's
  constant-velocity solution. Contact changes, stale observations and timing gaps
  clear acceleration history; stale/changed contacts also clear angular feedforward.
  Identical same-tick samples reuse the solution. No future target state is read.
- Use sight angular-rate feedforward and gun-axis error feedback (1.2 s response) to
  command aerodynamic bank/G. Add gravity compensation, project onto the current
  lift direction during rollout, and obey existing available-G/throttle limits.
  This is approximate feedback: AoA transients and changing target acceleration
  remain sources of error. It is not an instantaneous body or barrel rotation.
- Ace starts fine tracking at up to 1,400 m and uses 20° entry / 25° exit hysteresis.
  Lower tiers retain the original 900 m and 6° / 10° maneuvering capture envelope.
  Firing still requires the existing 120–900 m range. The lead trigger gate is at
  most 0.8°, checked every tick. A maintained solution permits a 0.7 s burst within
  the existing 1.25 s cycle. Lower-tier body-gate/pressure policy remains distinct;
  Ace's physical-tracking path does not authorize the legacy body fallback.

All new gains and gates are **authored policy**, not sourced physical constants.
The 1 m radius passed to the lead helper only fills unused solution metadata; neither
tracking nor damage consumes that radius. `GunKill` remains the hit authority.

## Acceptance and limitations

`GunConversionContractTests` exercises the same six deterministic engagements as the
baseline. Its historical lead/subtense reporting is a constant-velocity proxy, not a
measurement of intersection with the true solids. Its hits-per-round number excludes
pressure rounds; include those rounds when reporting overall ammunition efficiency.

`OpponentGunneryAcceptanceTests` keeps the original D1 break pilot and requires
passive lethality across eight seeds. `DefensiveGunneryAcceptanceTests` uses ordinary
analog inputs and delayed contact geometry: D1 breaks into the attack; D2 cuts power
with a close attacker behind, then unloads after observing an overshoot. It requires
the actual `DefensiveSuccess` outcome, not merely surviving until a timer expires.
This is an idealized delayed kernel pilot, not evidence of human visual performance.
The old full-power D2 break is a different maneuver and is reported separately.

`GunGimbalKidPilotTests` retains the offensive O1/O2 thresholds and adds an opt-in
passive defensive report. D3's existing delayed break/reversal is reported without
a newly invented acceptance threshold; it does not demonstrate a successful defense.

`OpponentGunneryCostReport` measures active `StepFixed` calls during the first two
seconds of fresh D1/D2/N/A2 sessions, with construction outside the timer. It asserts
the player is still flying so an early death cannot make the new kernel appear cheap.
Use `C12_CPU=1` to run the report alone. Its public `Measure` method also supports an
external runner loading base/current tests in isolated assembly contexts and
alternating trials in one process. This samples early active combat, not every
possible fight state, and shared-host timings must retain their spread.

Detailed before/after numbers, exact commands, CPU trials, headless keyboard/touch
flight evidence, screenshots and release-gate limitations belong in the package
handoff at `~/.local/state/guns-only-improve/handoff/c12-ai-gunnery.md`.
