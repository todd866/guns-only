# Okanagan defence mission pacing

Selecting a named defence mission previously started an empty aircraft at Kelowna. Big White
therefore required a long takeoff, scoop, climb and ferry before the named activity began, with
another full return after the attack. A physically possible route was passing verification even
though the player's time was spent far from the promised mission.

## Player experience

Peachland, Big White, SilverStar and Apex now begin six kilometres up the existing downhill
approach, loaded with the aircraft's feasible water allowance and pointed at the incident. The
initial aircraft has real water mass, loaded aerodynamic trim, forward velocity and matching
engine power. No flight forces or subsequent integration are simplified. The browser preserves
that power on Start and Restart instead of resetting it to runway power.

The mission is one defence run: identify the marked buildings, fly the terrain-clear descent,
deliver an effective load and fly the escape. Completion requires clearing the escape's position
and altitude gates, being more than 3.2 km from the target, and remaining airborne with at least 200 m terrain
clearance. Apex retains its authored valley turn. Dropping water alone does not grant success.
The result describes a sector handoff rather than falsely claiming the aircraft landed.

The opening instruction replays on restart. Cards explicitly say the start is airborne, and the
fuel briefing budgets the remaining approach rather than the unflown outbound ferry. Return
fuel and reserves remain protected. Water Circuits, Initial Attack and Large Force Employment
retain their existing full sortie profiles; the full defence departure/scoop/recovery factory
also remains available to existing simulation callers.

## Physical flight evidence

The new regression flies the unchanged 120 Hz aircraft with ordinary pilot commands through the
published route. It does not relocate the aircraft, synthesize a drop or advance the mission phase.
These are controller-flown results, not a claim that an unpractised player will match them.

| Defence | First useful drop | Safe handoff | Minimum terrain clearance | Sites reached |
| --- | ---: | ---: | ---: | ---: |
| Peachland | 95.7 s | 146.0 s | 171.9 m | 36 |
| Big White | 102.4 s | 154.6 s | 134.8 m | 20 |
| SilverStar | 107.2 s | 164.0 s | 99.4 m | 29 |
| Apex | 105.0 s | 172.5 s | 133.4 m | 16 |

The same suite checks actual mass accounting, load limits, initial alignment and speed, five
seconds of neutral-control launch stability, preserved runway training and fuel-abort behavior.
Independent review identified an aborted recovery that could later claim success on landing;
the player-mode recovery now retains the actual work requirement through that path too. Physically
flown early-dump and no-release attempts must end in a safe failed-run outcome, with no effective
drop credit. A separate lifecycle regression checks the abort through eventual recovery without
claiming that an injected landing proves its physical reachability.

Published browser acceptance checks normal menu selection and restart, loaded airborne state,
forward route guidance, the opening radio instruction, and correct initial power. Browser work
is headless, with `audioQa=silent` clamping the real audio destination. Physical route evidence,
browser integration and perceptual assessment remain distinct checks.

The compiled candidate's background hardware browser check passed on Apple M5 / Metal: all four
missions remained loaded and airborne at 58.3 m/s after five seconds, with rendered terrain
clearances of 522–779 m. Restart preserved arrival power and replayed the opening instruction.
Big White advanced through a full minute with default automatic trim and no flight input. These
are initialization/integration checks, not evidence of a controller-flown browser drop. The browser
and local server closed successfully. Evidence: `/private/tmp/fireboss-cockpit-audio-20260910/defence-candidate/evidence.json`.
