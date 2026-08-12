# Weekend Ride: make the circuit a game — design

2026-08-12. Owner-approved (priority: public experiences first — Weekend Ride, then Rapier
Intercept, then Korea Panther LSO grading). Scope of THIS spec is Weekend Ride only.

## The diagnosis

Weekend Ride is a lappable circuit **whose stopwatch nobody can read**.
`sim/Motorcycle/WeekendRideMissionRuntime.cs` already tracks `LapTimeSeconds`, `LapCount`,
`OffTrackSeconds` and `IsOnTrack` — but nothing keeps a completed lap, nothing knows your
best, nothing survives a reload, and no path publishes any of it to the rider's HUD. So you
ride a timed circuit where the time is invisible and forgotten the moment you stop. There
is no reason to take the next corner better than the last one.

## Design

### Completed laps and the personal best (sim)

- A lap completes on the existing circuit crossing that already drives `LapCount`.
- On completion, record `LastLapSeconds`, and update `BestLapSeconds` when the lap is both
  faster and **valid**.
- **Validity:** a lap is invalid if the rider was off-track at any point during it (the
  runtime already measures `OffTrackSeconds` and `IsOnTrack`), or if the bike tipped over
  and reset. Invalid laps still show their time; they never become the best. A lap set with
  two wheels in the dirt must not stand as a record.
- **Sectors:** split the painted circuit into three sectors by arc-length fraction of the
  lap distance. Record `SectorSeconds[3]` for the current lap and `BestSectorSeconds[3]`
  (best per sector, independent of which lap they came from).

### The delta (the number that actually motivates)

While riding, publish `DeltaToBestSeconds`: current elapsed lap time minus the best lap's
elapsed time **at the same circuit position**. This requires storing the best lap's split
profile — a small fixed-size array of elapsed times sampled at N=32 evenly spaced
arc-length fractions, not a full position recording. Negative is ahead, positive behind.

### HUD

Rider-facing readouts on the existing ride HUD canvas: current lap time (counting), last
lap, best lap, live delta coloured ahead/behind, sector marker flashes at each split, and
an invalid-lap marker. Laptop-first typography; do not build touch or portrait variants
([[laptop-first-mobile-is-a-separate-game]]).

### Persistence

`BestLapSeconds` + the best lap's split profile + `BestSectorSeconds` persist in
localStorage under a versioned key. **Fails safe:** unavailable or malformed storage means
no best (never a crash, never a blocked ride) — mirror the shell's existing
storage-failure pattern.

## Explicitly cut from v1 (YAGNI)

A ghost bike. It needs position recording plus playback and a rendered rider, and the live
delta already supplies most of the pull for a fraction of the work. Revisit only after the
owner has ridden the delta. Also out: leaderboards, multiplayer, penalties beyond lap
invalidation, and any mobile-specific work.

## Acceptance

- **Deterministic:** a scripted rider completing two laps records two lap times, the faster
  valid one becomes the best, and an off-track lap never becomes the best even when faster.
  Sector times sum to the lap time within tolerance. Same inputs → same numbers.
- **Persistence:** a best survives a reload; corrupt/absent storage yields no best and no
  error.
- **Rendered-frame QA:** ride the circuit in the real page and READ the HUD — timer runs,
  last/best populate at the line, delta moves with pace.
- **Owner ride (the real gate):** beating your own best is worth trying for.
