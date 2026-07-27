# HUD as attitude · energy · contact · limits (design)

Status: Design approved in conversation 2026-07-27 · Evidence from Desktop captures under
`analysis/desktop-captures/` · Child of the Rapier nav teaching aim ("miles a minute, lbs per mile,
lbs per minute, minutes of reserve at the destination") and the longer medevac patient-stats aim.

## Thesis

The kernel is honest. The HUD is not. Screenshots from Builds ~135–152 show a projective-truth
core (ladder, FPV, tapes, TD) buried under competing chrome: a multi-line propulsion banner on the
pitch ladder, essay-length egress cues, GATE captions over the sight, a nav console with instructional
footers and dual-unit overflow, and an Aircraft Systems panel that covers the altitude tape mid-climb.
The numbers that actually teach navigation — **nm/min, lb/min, lb/nm, reserve minutes at destination**
— either hide in a side console or get stuffed into a paragraph after the kill.

A pilot's eyes have one job at a time. The HUD answers **four questions**, in this order, and is
silent about everything else:

1. **Attitude / path** — where am I pointing, where am I going (ladder, FPV, horizon)
2. **Energy** — how fast / how high (tapes, Mach)
3. **Contact** — where is the thing that matters (TD / padlock / guidance square)
4. **Limits** — what binds me next (nav/fuel now; patient later; thermal/G when biting)

This is not a widget add. It redefines presentation hierarchy and gives medevac a stable socket
later without inventing a second UI language.

## Architecture

```text
┌──────────────────────────────────────────────┐
│ [pause]        HEADING TAPE       [gun heat] │
│              quiet mode line                 │  ← one short line, not a banner
│                                              │
│            pitch ladder + FPV                │
│                 □ contact                    │  ← geometry only
│                                              │
│  A/S                                   ALT   │
│  Mach                                  V/S   │
│                                              │
│                         ┌──────────────────┐ │
│                         │   LIMITS PANEL   │ │  ← always-on, four slots
│                         └──────────────────┘ │
└──────────────────────────────────────────────┘
```

### Limits Panel (always-on)

Lives in the current fuel-corner slot. Exactly **four slots**. Never a paragraph. Never optional
chrome. Content is a **profile**:

| Profile | When | Slot 1 | Slot 2 | Slot 3 | Slot 4 (hero) |
|---|---|---|---|---|---|
| `nav` | Recovery point known (`rtb_steer` / Rapier airborne with strip geometry / Circuits) | NM/MIN | LB/MIN | LB/NM | **RESERVE MIN** |
| `fuel` | No recovery point (Guns Only dogfight, etc.) | Fuel LB | FF PPH | to Joker MIN | to Bingo MIN |
| `patient` | Medevac (later; out of scope for first ship) | SpO₂ | HR | BP | GCS |

**Destination for reserve is always the recovery point (dispersed strip / boat), never the
contact.** Outbound intercept still uses `nav`: the teaching question is “can I fight and still
make the strip,” not “can I reach the merge.” Contact range stays on the TD / quiet line; it does
not drive reserve. Circuits uses the same rule — gates are geometry; reserve is still to the strip.

**Reserve minutes** (nav profile hero):

```text
etaMinutes     = rangeHomeNm / closingKts × 60   // closing = ground-track onto home bearing
fuelRequiredLb = currentFlowPph × (etaMinutes / 60)
reserveLb      = fuelAboardLb − fuelRequiredLb
reserveMin     = reserveLb / (currentFlowPph / 60)
```

Same closure rule already used in `rapier_guidance.js` / `updateNavConsole` — TAS must not drive
time-to-run on a ballistic lob. Negative reserve = already short. Accent:

- green when reserveMin ≥ 0.10 × etaMinutes (≈ 10% of fuel-required)
- amber when 0 ≤ reserveMin < that line
- red when reserveMin < 0

When navigating, **reserve minutes replaces Joker/Bingo countdown as the primary fuel decision**.
Threshold countdowns remain available in the nav console and as secondary status text if the aircraft
crosses Joker/Bingo/Min/Emer — they do not own the panel.

**Thermal** does not add a fifth Limits slot. Skin OVER / caution only: (a) forces Limits `accent`
to caution/fault, and (b) may replace the quiet mode line with `SKIN OVER` until clear. Detail stays
in Systems.

### Quiet mode line

One short line under the heading tape, e.g. `RAM CLIMB · FL700` or `EGRESS · HOME` or
`CIRCUITS · GATE 2/4`. Authority (`PILOT` / `AUTO`) fits here as a prefix if needed.
**No thrust bars. No lever. No KTAS. No thermal. No instructional copy.**

### Contact geometry

Guidance square / TD stays. Captions like `GATE 0/4 · FLY THROUGH` and long `HOME 179° · … · NEED
… · HAVE …` strings leave the centre. Gate index belongs in the quiet mode line. Nav numbers belong
in Limits.

### Consoles are diagnostic

- **Nav console** keeps bearing, range, ETA, fuel need/have/margin for study. It does not own the
  decision. Dual-unit newlines (`KT\nKM/H`) are forbidden; one unit per cell. Instructional footers
  are out of the in-flight panel (help text belongs in Controls / briefing).
- **Aircraft Systems** stays closed unless the pilot opens it. Turbine/ram thrust share and skin
  temperature live there (quiet-line / accent override when OVER — see Limits Panel).
- Opening Nav collapses Systems and vice versa (mutual exclusion).

### Presentation contract

Pure function, testable without canvas:

```text
limitsPanelPresentation(state) → {
  profile: "nav" | "fuel" | "patient",
  rows: [{ label, value, unit }],  // length 4
  accent: "normal" | "caution" | "fault",
  heroIndex: 3                     // reserve / bingo / GCS
}
```

Inputs already exist on the snapshot (`fuel_lb`, `fuel_flow_pph`, `ground_speed_kts`, `rtb_*`,
`rapier_mission_*`, closure via `vx`/`vz`). No kernel change required for the first ship unless a
scenario lacks a destination flag — then presentation infers `nav` vs `fuel` from
`rtb_steer` / Rapier phase / Circuits gate state.

`patient` profile is a typed empty socket in the first ship: the function may return `null` rows for
that profile until medevac lands. Do not invent vitals.

## Demotions and deletions (first ship)

| Current surface | Fate |
|---|---|
| Centre-top propulsion banner (mode + turbine/ram bars + lever + Mach + KTAS) | Remove from always-on HUD. Mode fragment → quiet line. Bars → Systems. |
| Long Rapier guidance `detail` string with triad + NEED/HAVE | Remove. Triad + reserve → Limits. |
| `GATE N/4 · FLY THROUGH` canvas caption | Remove caption; keep square; gate in quiet line. |
| Nav console `tf-note` instructional footer | Remove from in-flight DOM. |
| Groundspeed dual-unit `\n` into KM/H under `white-space: nowrap` | Single unit (KT). |
| Circuits destination reading HOME while flying gates outbound | Destination = next gate / CONTACT while outbound; HOME only on egress/recovery. |
| Aircraft Systems open covering altitude tape by default | Start closed; mutual exclusion with Nav. |

## Scenario teaching

Briefings and live HUD use the **same four words** (nm/min, lb/min, lb/nm, reserve min).

- **Rapier Intercept** — Limits stays on `nav` from airborne (strip geometry known) through
  recovery. Reserve is always to the strip; amber/red on egress is the lesson.
- **Rapier Circuits** — soft bingo remains (repetition is the point) but Limits still shows the four
  numbers so the habit forms without pressure.
- **Guns Only dogfight** — `fuel` profile; no fake destination.
- **Medevac (later)** — swap profile to `patient`; panel geometry unchanged.

## Non-goals (first ship)

- Redesigning tape projective math, EEGS funnel, or padlock (keep; they are the honest core).
- Per-stream fuel simulation (still derived; HUD must not claim kernel-owned turbine vs ram fuel
  until the map owns it).
- Building real patient vitals.
- Art-direction / terrain fidelity.
- Replacing the kernel-offline stack-trace modal (separate UX; note only).

## Acceptance

1. With destination: Limits shows NM/MIN, LB/MIN, LB/NM, RESERVE MIN every frame; no centre propulsion
   banner; no triad paragraph on the guidance cue.
2. Slowing down at constant altitude improves LB/NM and reserve minutes visibly within one second of
   flow/closure change.
3. Climbing steeply toward home does not report optimistic ETA/reserve from TAS alone (closure rule).
4. Without destination: `fuel` profile; Joker/Bingo minutes still glanceable.
5. Circuits: quiet line carries gate index; square has no essay caption; destination is not HOME
   while outbound.
6. Nav console: no footer lecture; no dual-unit overflow into Gross Weight.
7. `limitsPanelPresentation` unit tests cover nav/fuel profile selection, reserve sign, accent bands,
   and closure fallback.
8. Existing HUD geometry contract and `./bin/check` stay green.

## Implementation sketch (not the plan)

1. Add `render/hud/limits_panel.js` (+ tests) implementing the contract.
2. Replace `CombatHud.drawFuel` call site with Limits rendering; keep fuel bar as a thin header
   inside the panel when profile is `nav` or `fuel`.
3. Collapse Rapier guidance presentation to quiet mode line; strip centre engine chrome.
4. Fix nav console overflow + footer + Circuits destination.
5. Gate caption → quiet line only.
6. Wire mutual exclusion for Nav / Systems details elements in `app.js`.

Detailed task breakdown belongs in a writing-plans pass after this spec is accepted.
