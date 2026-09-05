# Build 353: practice, player history, and release evidence

Prepared 5 September 2026 on `fix/player-quality-353`, from production revision
`1ed5488d0271aad87118fa8c64eb9dcbd0d50c79` (Build 352). This is a local candidate;
production remains Build 352 until an explicitly approved push and deployment.
The [baseline audit](2026-09-05-holistic-audit-build-352.md) explains the priorities.

**The change makes the first successful exercise and the next attempt easier to reach.**
Practice has three deliberately bounded F-22 scenarios: clear Kestrel Gorge, make a controlled
gun pass, and recover to the conventional runway. They use the existing aircraft, ballistics,
terrain and landing authority. Each has a separate exercise result; none awards campaign
victory or changes aircraft capability. Landing practice requires survivable contact followed
by a physical full stop. A fatal tick takes precedence over a simultaneous objective event.

Practice is available from the main menu and pause/debrief shell. Each exercise has one
objective, a brief, a live reminder, an explicit result and a repeat action. Gunnery uses a
scripted, unarmed target in clear weather. Recovery begins eight nautical miles out. Exercise
state is projected through the existing snapshot contract, including immediate cold-version
invalidation on lifecycle changes. The authority code lives in focused practice modules
rather than adding a large mission branch to the central simulation file.

The local pilot logbook records actual started attempts across the main fixed-wing programmes,
Cobra, Weekend Ride and Fire Boss. It distinguishes practice, completion, loss and abandonment;
shows available physical evidence and one correction; and compares like-for-like attempts.
History is capped at 100 and has export and clear controls. No account or central gameplay
collection is needed. Denied storage remains usable in memory; normal writes merge other tabs'
results and respect deletion. Native modal ownership blocks gameplay shortcuts and pauses
authority while browsing the notebook.

Essential green HUD labels now have a dark outline. Cobra has a visible, reachable Pause
button during flight. Fire Boss briefing and debrief typography follow the existing warm
shared shell. The root return action is named Aircraft. Actual first visits and automated
first visits now share the same valley routing; catalog tests request the catalog explicitly.
Restoring a page whose runtime was disposed in the browser Back/Forward cache reloads into a
coherent brief. A recursive release revalidation exposed by the new notebook journey was
fixed at the Ready screen's actual visibility boundary.

Shell-health timestamps now preserve first occurrence across retransmission, and aggregate
milestone/fatal counts deduplicate within a session. Documentation distinguishes the minimal
shell-health channel from optional detailed gameplay diagnostics. The status ledger pins the
actual deployed revision and can describe a local candidate without pretending it is live.

Release acceptance now has a source/artifact/content/atlas identity and separate columns for
boot, action, outcome, recovery, retry, visual review, performance and human acceptance.
Claims require a matching proof kind, route, device, seed and file digest; human claims also
require a witness. Unrun columns remain `not_run`. CI attaches the inventory to its published
browser diagnostics. This records the evidence boundary; it does not turn a boot check into a
complete-sortie pass or automatically enforce a new release policy. The existing gate now
also executes the arena Worker and ASP.NET suites, telemetry-report tests and the published
practice/logbook journey.

**Verification record.** The source/content stage passed 2,441 Node tests (one existing
optional test skipped), 85 Python tests, 2,454 simulation tests (ten existing optional tests
skipped), ten presence-server tests and four arena-server tests. The Release solution built
with zero warnings and errors and the published terrain closure passed verification.
The complete `bin/check` finished successfully, including all 18 published-browser cases
and 2,265 HUD geometry assertions. Eight focused profiling-route checks also passed after
making the F-22 profiling utilities request the catalog explicitly (`menu=1`) and retain
silent audio and disabled shared presence. The game files remained frozen through this run;
all 45 changed published runtime files match the retained gate artifact byte for byte.

The published-browser practice journey passed real staging, gun input, pause, restart and
abandonment for all three exercises, plus logbook keyboard ownership and a 390 × 844 layout.
Practice authority tests cover real valley completion, stable target flight, physical runway
contact/rollout/full stop, loss precedence and snapshot invalidation. Test fixtures position
the aircraft near a gate or touchdown to exercise the authoritative boundary; they are not
full approaches flown by a human. The practice browser test proves gun input and ammunition
expenditure; it does not claim a complete contested combat sortie.

Final silent visual inspection on that same published artifact confirmed the reachable Cobra
Pause control and its menu, readable Fire Boss briefing hierarchy, and the gunnery exercise's
visible target and unobscured bottom reminder. The earlier 390 × 844 notebook capture and the
published test cover its phone reflow. These are targeted inspections, not a comprehensive
scenery score. All QA tabs and local preview servers were closed afterward.

**Limits and next work.** This candidate does not claim six completed human acceptance
sorties, a qualified F-22 combat autopilot, an audible mix review, or a measured hardware FPS
improvement. The full autonomous mission and scenery-scoring suites remain separate checks.
A novice playtest and exact-artifact contested-fight/recovery evidence should guide the next
iteration. Startup measurement and selected-route loading, broader lifecycle extraction,
snapshot-code generation and the larger connected Cohort scenario remain future work; this
change establishes a small usable practice/history loop without expanding the world.
