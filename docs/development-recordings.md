# Development screen recordings

A historical record of the project being flown during development. The **media lives in
`recordings/` and is deliberately NOT in git** — the four files below total 1.9 GB and every one of
them exceeds GitHub's hard 100 MB per-file limit, so committing them would fail the push outright
and, if forced through, would bloat every future clone permanently. Git history is not an archive
format for video.

This index is the part that belongs in the repo: what exists, when it was captured, and what the
build looked like at that moment. If the media moves to external storage later, update the
**Location** line and the record survives.

**Location:** `recordings/` in this working copy (gitignored).

| File | Captured | Size | What the build was doing then |
|---|---|---:|---|
| `dev-2026-07-22-215227.mov` | 22 Jul 2026, 21:52 | 1.02 GiB | Around **Builds 63–65**. Same evening as the per-frame JSON bridge becoming a hot double-buffer (`4bc4f62`), the trajectory-true gun funnel and honest FPV (`7275c94`), and the simulated cloud field being disabled for performance (`a0caeec`, 21:43 — nine minutes before this capture). |
| `dev-2026-07-23-100532.mov` | 23 Jul 2026, 10:05 | 457 MiB | Morning of the day that ended with the **Fight Director** landing — low-block hunting and the Su-35S ace rung merged that evening (`a8adb8d`), followed by the 15 G machine spike (`1eefec3`). |
| `dev-2026-07-24-112315.mov` | 24 Jul 2026, 11:23 | 183 MiB | **Build 97** era, before that evening's terrain performance work (chunk-build time-slicing `5abdd06` and analytic terrain normals `0e5ff22`). |
| `dev-2026-07-24-112629.mov` | 24 Jul 2026, 11:26 | 272 MiB | Immediately after the previous one — same session, same build. |
| `dev-2026-07-25-153405.mov` | 25 Jul 2026, 15:34 | 379 MiB | **Build 114.** The sortie where the ladder finally bit: 1v2 opening wave against Aces, and the pilot was gunned down for the first time. Also the tape behind the frame-rate diagnosis — the matching telemetry session `web-1784957280750-142586` has windows whose MEDIAN frame is 166 ms and 283 ms. |
| `dev-2026-07-25-153921.mov` | 25 Jul 2026, 15:39 | 19 MiB | Build 114, five minutes later. Recorded specifically to show the frame rate: "it's really bad for immersion". |
| `dev-2026-07-25-160042.mov` | 25 Jul 2026, 16:00 | 344 MiB | Build 114/115. The target-aft BFM problem: "when it's target aft it becomes very difficult to tell where am I supposed to roll to pull to the enemy". |
| `dev-2026-07-25-181329.mov` | 25 Jul 2026, 18:13 | 3.7 GiB | **Build 118.** Nine minutes, and the pilot's verdict was "some of the best damn dogfighting I ever did" — the first tape after the 1v2 ladder, the kill cam and the terrain-aware crash physics all landed together. Video only, no audio track. Much the largest file here; a transcode candidate. |
| `dev-2026-07-25-174036.mov` | 25 Jul 2026, 17:40 | see dir | **Build 117.** Clouds rotating with the aircraft through a 360-degree roll — a presentation frame bug, still open. The matching telemetry session `web-1784964623929-854663` is the decisive frame-rate tape: the new per-phase probes attribute 60.4 ms of an average bad frame to the SIMULATION and 2.99 ms to everything else combined. |
| `dev-2026-07-25-163933.mov` | 25 Jul 2026, 16:39 | 344 MiB | **Build 116** — first tape with the relocated pause button and the always-available AIRCRAFT SYSTEMS console. Filed as "still getting some z buffer issues I think"; it is not a depth artefact but the edge of the terrain dataset at 21,000 ft, which led to the world-edge fog coupling and the far-field terrain question. |

## If you want these in version control properly

Git LFS is the only sane route, and it is not free at this size: GitHub's LFS allowance is 1 GiB of
storage and 1 GiB/month of bandwidth on the free tier, and this set alone is 1.9 GB. Cheaper
options, roughly in order of how little they cost:

1. Leave them local (current state) and keep this index accurate.
2. Transcode before archiving — screen recordings of a 60 fps 3D scene compress hard. H.265 at a
   sane bitrate typically lands 5–15× smaller with no loss that matters for a development record.
3. Push to object storage (the project already uses Vercel Blob for telemetry) and record the URLs
   in the table above.
