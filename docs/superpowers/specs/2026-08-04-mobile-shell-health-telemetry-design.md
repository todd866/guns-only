# Mobile shell-health telemetry

Status: implementing  
Date: 2026-08-04  
Build target: 262+

## Problem

Detailed flight telemetry is opt-in after Ready. Mobile users who black-screen, hang on boot, or bounce in in-app browsers never upload — so breakage is invisible. Among opt-in visitors (~91% phone), roughly half never start a sortie; we cannot see *why*.

## Decision

Ship both:

1. **Always-on shell-health beacon** — minimal, non-opt-in POSTs for boot milestones and fatals.
2. **Report upgrade** — platform-split funnel, shell-health counts, touch_ready / FrameGovernor pressure from existing opt-in data.

## Always-on payload (`guns-only.shell-health.v1`)

Sent to existing `/telemetry` with a distinct session prefix (`shell-…`) so it never mixes with opt-in flight sessions.

Included:

- build / revision (from release identity)
- platform: `ios` | `android` | `desktop` | `unknown`
- browser family + arrival channel (`threads`, `safari`, `chrome`, `facebook`, …)
- short UA family string (enough to spot in-app browsers; not a full stick/flight dump)
- viewport bucket: `phone-portrait` | `phone-landscape` | `tablet` | `desktop`
- milestones: `script_load` → `bridge_ready` → `webgl_ok` → `ready` → `active`
- `fatal` with classed reason: `webgl` | `bridge` | `module` | `oom` | `unknown` (message truncated; no stack)

Excluded: stick inputs, aircraft state, multiplayer ids, 20 Hz traces.

Flush on milestone edges, `showFatal`, and `pagehide` (`keepalive` / `sendBeacon` where available).

## Consent copy

Ready/settings text stays truthful: gameplay diagnostics remain opt-in. Add one line that minimal shell-health (boot/fatal, device class) is always sent so the product can see broken boots.

## Report

`bin/telemetry-report` gains:

- funnel split by platform
- shell-health milestone / fatal tallies when present
- `touch_ready` rate and FrameGovernor event pressure from opt-in phone sessions

## Out of scope

Fixing the underlying mobile bugs — measurement only.
