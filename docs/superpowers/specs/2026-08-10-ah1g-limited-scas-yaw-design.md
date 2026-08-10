# AH-1G limited-authority SCAS yaw (Build 304)

Updated: 2026-08-10

## Intent

Autotrim must feel like AH-1G SCAS (±12.5% authority), not perfect torque cancellation.
Feet-off full collective from hover must climb **and** yaw enough that the pilot needs pedal.

## Non-goals

- No full physical tail-rotor BEMT this build
- No new player “SAS on/off” option (SCAS stays part of the uncompensated aircraft model’s
  limited-authority channel; friendlier assists remain a future labeled option per
  `docs/airframes/ah-1g-cobra/10-flight-model.md`)
- No wholesale rewrite of rate-command cyclic handling

## Product rules

1. Remove “tail-rotor trim removes steady main-rotor torque.”
2. Derive a torque-driven yaw demand from main-rotor power/load (steady + transient).
3. SCAS yaw: first-order lag using `StabilityAugmentationYawLagSeconds`, output hard-capped at
   `StabilityAugmentationAuthorityFraction` of pedal/yaw authority.
4. Keep engine-out left-yaw tendency.
5. Epistemic: SCAS lags/authority remain `measured` (NASA CR-3144); torque→yaw gain for the
   reduced-order rate channel is `provisional` until flight-test closure — document in sources.

## Acceptance

- Mild collective: SCAS mostly covers yaw.
- Hard collective, feet off: residual yaw rate / heading drift requiring pedal.
- Existing rotor energy / VRS / RBS contracts stay green.
