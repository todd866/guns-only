# Circuits preflight brief in the menu (design)

Status: Approved · 2026-07-28 · Inspired by MD M5 `/present` teaching patterns;
fits Guns Only ready-screen chrome. **Approach A shipped (expandable preflight panel).**

Builds on: `2026-07-27-circuits-sa-boxes-design.md`, `2026-07-27-circuits-fd-boxes-design.md`,
`2026-07-27-rapier-circuits-oft-design.md`.

## Thesis

Rapier Circuits is pattern school. The ready-screen brief today is one dense paragraph. Players
need a short **preflight** that teaches the overhead, config by leg, and DEMO / DIRECT / MONITOR
*before* they hit Fly — without a medical-branded deck or a full menu rewrite.

Borrow the MD presentation’s **teaching grammar** (eyebrow → thesis → stepped structure →
bottom line → optional depth), not its colours, crest, or clinical voice.

## Inspiration (MD project — what to steal)

Authoritative live talk: `~/Desktop/medicine/md-project/lab-site/src/content/presentation/deck.json`
rendered by `lab-site/src/app/present/PresentClient.tsx` at `/present`.

| Pattern | Why it works for Circuits |
|---|---|
| Eyebrow + heading + subhead | Instant “what this sortie is” |
| Timeline / numbered rows | Overhead legs map cleanly to stops |
| Bottom line | One sentence they must remember before Fly |
| Click-for-more / subdeck | Config detail and coaching modes without cluttering the first glance |
| Thesis chip on title | “No Mach dash · pattern school · hook always down” |

**Do not copy:** USyd red/ochre/cream brand, medical thesis tone, fullscreen slide theatre as the
default path into every sortie.

## Current Circuits menu state

| Surface | Today |
|---|---|
| Sortie card (`index.html`) | “Launch, fly the pattern, trap. Repeat until the hook is easy.” |
| `CAMPAIGN_BRIEFS["rapier-circuits"]` (`app.js`) | Single `brief` paragraph: overhead numbers + DEMO/DIRECT/MONITOR + “No Mach dash”; `controls` for P / stick / Tab / V |
| Ready briefing column | `#ready-kicker` · `#ready-title` · `#ready-brief` · two facts · `#ready-controls` · Fly |
| In-flight SA (Build 156+) | Overhead boxes, traffic, DEMO/DIRECT/MONITOR, nav/systems — taught in-world, not in menu |

Gap: the brief crams pattern + coaching into ~two sentences; there is no stepped preflight, no
leg table, no progressive disclosure. Carrier already has a ready-only config strip
(`#ready-deck-config`) — a Circuits preflight can follow that “extra panel when this sortie is
selected” precedent.

## Content contract (all approaches)

Aussie / RAAF-adjacent tone: short, operational, no fluff. Same facts as SA / FD specs.

### Bottom line (always visible)

> Military overhead · ~1,800 ft AGL · 300 KT initial/downwind · 180 KT final · fly the boxes · trap the wire. P = DEMO; touch stick = DIRECT; P off = MONITOR. No Mach dash.

### Pattern steps (overhead — not GA rectangle)

| Leg | Intent | Ballpark |
|---|---|---|
| DEPART | Ski-jump → climb → join INITIAL | Pattern alt ~1,500–2,000 ft AGL |
| INITIAL | Runway heading, midfield | ~300 KT, hook down |
| BREAK | ~180° to downwind | ~45° bank |
| DOWNWIND | Opposite parallel, abeam | ~2–2.5 NM offset, ~300 KT |
| BASE | Continuous turn to final | Shed toward ~220 KT |
| SHORT FINAL | T&G / go-around before midfield gear | ~180 KT |
| WIRE FINAL | Accept trap; aerobrake → wire | ~170–180 KT |

### Coaching modes

| Mode | How | What stays on |
|---|---|---|
| DEMO | P on (default) | Auto flies; FD + boxes |
| DIRECT | Touch stick while DEMO | You fly; FD + boxes stay |
| MONITOR | P off | You fly; coaching quiet / off per existing behaviour |

### Controls line (keep near Fly)

`P DEMO ↔ MONITOR · stick takeover = DIRECT · arrows/W/S · T time · V threshold · Tab traffic · fly the boxes · trap the wire`

## Approaches

### A — Expandable preflight in the ready briefing (recommended)

When `rapier-circuits` is selected, keep the short thesis brief, then show a Circuits-only panel
(same slot idea as carrier `#ready-deck-config`):

1. **Always visible:** kicker, title, bottom-line brief (tightened copy), sortie / configuration facts, controls, Fly.
2. **Disclosure** (`<details>` or “Preflight · pattern” toggle, default **open on first Circuits visit**, then remember collapsed preference in `localStorage`):
   - Compact **leg strip** (INITIAL → BREAK → … → WIRE) — MD timeline stops, Guns Only green chrome.
   - Three **mode chips**: DEMO / DIRECT / MONITOR with one-line each.
   - Optional second disclosure: “Config by leg” table (speed / altitude cues).
3. Data: extend `CAMPAIGN_BRIEFS["rapier-circuits"]` with structured fields (`preflightLegs`, `preflightModes`, `bottomLine`) so copy is not HTML-hardcoded; render only when that node is selected.

**Pros:** Fits existing two-column ready screen; mirrors settings disclosure + deck-config patterns; progressive disclosure like MD `more` / subdeck without a second app. Small CSS/JS surface.  
**Cons:** Briefing column gets taller on mobile — collapse-by-default after first open mitigates.

### B — Full-screen preflight deck before Fly

Multi-step overlay (3–4 “slides”: thesis → pattern timeline → modes → fly) styled like MD `/present` but in Guns Only dark/green.

**Pros:** Highest teaching fidelity; room for a simple overhead diagram.  
**Cons:** Blocks “Enter to fly”; large new UI; wrong default for a game menu; medical-deck muscle memory without the brand fit. Offer later only as optional “How to fly Circuits” from the disclosure, not as a gate.

### C — Content-only brief rewrite

Rewrite `brief` / `controls` strings only — no new markup.

**Pros:** Trivial; ships facts immediately.  
**Cons:** No structure, no progressive disclosure; still a wall of text; weak use of MD inspiration.

## Recommendation

**Ship Approach A.** Tighten the visible brief to the bottom line; put legs + modes in a Circuits-only expandable preflight panel in `.ready-briefing`. Defer B as an optional deep-dive later. Do **not** stop at C alone if the goal is MD-style teaching clarity.

## Mock (textual)

```
RAPIER CIRCUITS
2030s Ukraine · overhead circuit practice

Military overhead · ~1,800 ft AGL · 300 KT initial/downwind · 180 KT final.
Fly the boxes. Trap the wire. No Mach dash.

Sortie          Configuration
Ski-jump · …    Attritable Rapier · full fuel · hook down · no contact

▸ Preflight · pattern                    [open]
  DEPART → INITIAL → BREAK → DOWNWIND → BASE → SHORT FINAL → WIRE
  · INITIAL / DOWNWIND ~300 KT · FINAL ~180 KT · hook down always

  DEMO (P)     auto on · watch the boxes
  DIRECT       touch stick · FD/boxes stay
  MONITOR      P off · you own it

P DEMO ↔ MONITOR · stick = DIRECT · …
[ Fly Rapier Circuits ]
```

## Non-goals (v1)

- Full-screen forced deck before every Circuits start
- Copying MD red/cream/crest branding
- In-world HUD changes (SA/FD already own that)
- Teaching Intercept climb / Mach / drones on this panel
- New mission type or campaign progression changes

## Implementation sketch (after approval)

1. Extend `CAMPAIGN_BRIEFS["rapier-circuits"]` with structured preflight fields; keep `brief` as bottom line.
2. Add `#ready-circuits-preflight` markup in `index.html` (hidden unless Circuits selected).
3. Populate from brief in the existing ready-screen update path (`missionBrief()` / ready paint).
4. Style with existing ready-screen tokens (green hairlines, uppercase labels) — no new brand system.
5. `localStorage` key for disclosure open/closed after first Circuits selection.
6. Smoke: select Circuits → panel visible; select Guns Only → hidden; Fly unchanged.

## Open question

**Default presentation:** expandable card in the briefing column (A), or a one-time full-screen preflight the first time Circuits is selected (light B hybrid)? Spec assumes A with first-visit open disclosure unless overruled.

## Acceptance (when built)

1. Circuits selection shows bottom-line brief + preflight panel with legs and DEMO/DIRECT/MONITOR.
2. Other missions unchanged (panel hidden).
3. Enter / Fly still starts the sortie without a mandatory multi-slide gate.
4. Copy matches SA overhead numbers and coaching grammar; Aussie/RAAF-adjacent, not clinical.
5. No MD brand colours or medical voice in Guns Only UI.
