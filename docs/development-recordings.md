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

## If you want these in version control properly

Git LFS is the only sane route, and it is not free at this size: GitHub's LFS allowance is 1 GiB of
storage and 1 GiB/month of bandwidth on the free tier, and this set alone is 1.9 GB. Cheaper
options, roughly in order of how little they cost:

1. Leave them local (current state) and keep this index accurate.
2. Transcode before archiving — screen recordings of a 60 fps 3D scene compress hard. H.265 at a
   sane bitrate typically lands 5–15× smaller with no loss that matters for a development record.
3. Push to object storage (the project already uses Vercel Blob for telemetry) and record the URLs
   in the table above.
