# Eastern authority · points ledger · Ghibli tragedy (sortie pass)

Date: 2026-07-27  
Status: accepted (implementation plan: `docs/superpowers/plans/2026-07-27-eastern-authority-points.md`)  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[ghibli-adjacent art direction](2026-07-27-ghibli-adjacent-art-direction-design.md),
[Ukraine setting idea capture](../../2026-07-26-reclined-seat-and-ukraine-setting.md),
[buried launch / Ukraine theatre](../../2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md),
[content governance](../../content-governance.md)

## Goal

Ship the Rapier Ukraine-theatre loop as **sortie-only flight with a clear authoritarian points
ledger**, launching from the **East**, under existing Ghibli-adjacent soft world / cold instruments.
Build quietly toward a later clinic → medevac → command career without implementing those phases
now. The tragedy is incentive distortion and permanence-theatre, not a scripted crisis of
conscience.

## Non-goals

- Clinic, medevac dispatcher, village reputation, or regional commander UI.
- Soviet costume drama (banners, Gosplan LARP, comic shoddy-tech satire).
- Reluctant-hero diary / voiceover awakening arc.
- Full faction string rewrite and Korea-braid constitutional migration in this pass.
- Kernel physics or HUD projective-truth changes.
- FightDirector ↔ ledger coupling (noted as follow-on).

## Locked decisions

| Decision | Choice |
| --- | --- |
| Theatre | Existing 2030s Ukraine theatre (synthetic AOI) |
| Home plate | Eastern edge of theatre; sorties run into the land |
| Player stance | Fly planes; clear incentive scheme; no diary |
| Moral register | Tragedy of authoritarian systems via what pays |
| Cultural tone | Late-Soviet / Yurchak “everything was forever until it was no more” — hypernormal, municipal, permanent — not red-banner kitsch |
| Art | ADR-0003 Ghibli-adjacent soft world, cold instruments |
| Career pipeline | Bible-only residue; not gameplay this pass |
| Approach | Tone + ledger overlay (eastern launch + debrief points); geometry and copy before full dossier rewrite |

## Product contract

### What ships in this pass

- Same Ukraine soft-world scenery stack (Soniachne hero cell and Rapier corridor content remain;
  launcher datum may move east of Soniachne — see basing).
- Player launches from the **East** — buried strip / launcher on the eastern approach.
- Sortie-only loop: fly, land or punch out, debrief.
- Thin **points ledger** on debrief: credits, debits, net, running balance, next-sortie clearance.

### Quiet aim

- Soft world outside · cold phosphor inside.
- Authoritarian tragedy via incentives and permanence-theatre.
- Every sortie should leave residue that makes clinic / medevac / command feel inevitable later —
  without shipping those systems.

### Tone lock (Yurchak, not Gosplan LARP)

- Hypernormal: procedures work; clearances clear; the ledger balances.
- Eternal-until-not: UI and briefings treat the arrangement as simply how life is.
- Melancholy competence: beautiful valleys, efficient machines, no freedom speechifying.
- China-propped imports and AI governance may appear as texture (serial plates, polite immutable
  denials) without becoming the joke.

## Eastern basing and mission geometry

### Present fact

Rapier strip uses local origin with `headingRad: 0` (runway along **+north**); authored intercept
contact is far **north**. That reads as mid-theatre basing flying north, not eastern launch.

### Target fiction

- Home plate on the **eastern edge** of `Ukraine2030sTheatre`.
- Launch / recovery axis points **into the theatre** (roughly **west / WNW**).
- Deep intercepts and low-level work happen **west of home**; egress returns east to the buried strip.
- Punch-out / recovery can place the pilot among villages tasked over — Ghibli glimpse stays
  geographically honest.
- Exact real-world lat/lon remain synthetic; eastern edge is a **fiction placement**, labeled so.

### Sortie-pass changes

1. Re-orient the fixed strip (deck heading ~π west, or documented WNW if wind/terrain requires).
2. Re-place the strip on the eastern corridor — Soniachne may remain a **forward / hero low-level
   cell** overflown, not necessarily the launcher datum.
3. Rewrite authored contact geometry so merges occur west of home at ranges that still force climb +
   ram (retain today’s fuel / reach thesis, ~240 km class).
4. Circuits beat keeps the same aircraft / launcher / strip; only heading and world placement change.

### Unchanged

- Catapult / arrestment kernel math, Rapier surrogate, HUD projective truth.
- Soft-world scenery grammar; no new biome pack required for this pass.

### Quiet tragedy beat (no new UI)

After trap or punch-out, land west of home is warm and lived-in; home plate east is concrete, berm,
and phosphor. You always return to the machine.

## Points ledger (sortie pass)

### Loop

1. Sortie ends (trap, punch-out, or loss).
2. Debrief shows a short **ledger slip**: credits, debits, net, running balance.
3. Balance gates the next offer — fuel load / cleared / deferred / grounded pending allocation —
   not a full shop UI.

### v1 rate card (fiction, labeled)

Concrete point magnitudes are locked in the implementation plan, not here. Shape and polarity are
normative. **Ledger v1 only scores facts already present (or trivially derived) from the sortie
record.** Rows that need new instrumentation are deferred, not faked in presentation.

**Credits (ship when evidence exists)**

| Credit | Why the system likes it | Evidence gate |
| --- | --- | --- |
| Verified enabler / bandit kill (guns-only, in ROE) | Matches Rapier’s job; countable | Existing kill / splash events |
| Clean recovery to eastern strip | Asset returned to the pool | Existing trap / recovery-complete |
| Sortie completed without loss | Compliance baseline | Sortie end state |

**Debits (ship when evidence exists)**

| Debit | Why | Evidence gate |
| --- | --- | --- |
| Sortie fuel burned | Always | Existing fuel accounting |
| Airframe loss / unrecovered end state | Large debit | Existing loss / punch-out without recovery |
| Hard-pull / fatigue events | Depreciating recline jet | Only if fatigue is already on the record; else defer |

**Deferred (rate-card rows, not v1 UI lies)**

| Row | Notes |
| --- | --- |
| Geofence / corridor compliance | Needs authored corridor events before it can debit/credit |
| Collateral flags | Needs an honest evidence source; do not invent for tone |
| Recovery-drone clearance | Only when punch-out recovery is a real recorded outcome |

### Authoritarian texture

- Municipal permanence: “allocation posted,” “norm fulfilled,” “exception denied.”
- No patriotic slogans; no comic incompetence. The ledger **works**.
- Easy countable kills may outpay hard necessary ones — player notices without a moral tooltip.

### Explicit non-goals this pass

- Catalogue / grey-market / bribe minigames.
- Clinic tokens, medevac routing, village reputation meters.
- FightDirector difficulty coupled to ledger (follow-on: one evidence stream should feed both).

### Quiet residue toward later phases

A punch-out that still credits “asset recovered” while the soft world flashes under the parafoil —
ledger green, eyes not. Enough Ghibli-tragedy without a clinic sim.

## Presentation, copy, governance

### World

ADR-0003 unchanged: painterly Ukraine theatre; cold phosphor HUD / capsule / debrief instruments.
Eastern home = concrete and strip lights; west of home = lived-in land. No Soviet costume layer.

### Copy register

- Briefing / debrief: short, procedural, present-tense.
- Avoid patriotism, meme authoritarianism, reluctant-hero voiceover, comic shoddy-tech jokes.
- Opponent and civilians retain interiority ([content governance](../../content-governance.md)
  rule 7): instruments may show tags; prose does not sneer.

### Epistemic labels

| Claim | Label |
| --- | --- |
| Ukraine theatre geography / soft-world look | Existing theatre + ADR-0003 |
| Player as eastern authority / AI-governed post-Putin Russia / China-propped imports | `fiction` |
| Points rate card and clearance gates | `fiction` (inspired by real wartime points systems; not a forecast) |
| Yurchak / “everything was forever…” tone | Aesthetic reference, not historical reenactment |

### Governance delta

- This design supersedes the “player-as-Ukrainian-points-pilot” implication in idea-capture docs for
  the **shipping Rapier loop**.
- Does **not** rewrite Korea-braid constitutional decisions; this is a 2030s Ukraine-theatre product
  overlay.
- Live-war care unchanged: no identifiable real casualties; speculative orgs/platforms labeled
  `fiction`.

### UI surfaces (sortie pass)

- Debrief ledger slip (credits / debits / net / running balance / next-sortie clearance).
- Optional one-line mission header (“Eastern corridor · guns-only”).
- No clinic, village rep, or medevac boards.

## Architecture (sortie pass)

```text
SimulationSession (unchanged physics / HUD truth)
    -> sortie outcome events (kills, recovery, fuel, fatigue, geofence flags)
        -> PointsLedger (deterministic rate card over recorded events)
            -> debrief slip + next-sortie clearance token
Presentation: eastern strip placement + heading; ADR-0003 world; municipal copy
```

- Ledger may only score facts derivable from the sortie record (same debrief evidence rule as
  governance).
- Campaign/profile may store running balance; it may not rewrite physical outcomes or buff airframe
  performance.

## Success criteria

- Rapier Intercept / Circuits launch from an eastern home plate into the theatre (heading and
  placement read correctly on map and in world).
- Debrief shows a ledger slip whose net a newcomer can understand in one glance.
- Easy-vs-necessary distortion is *expressible* in the rate-card shape (enabler vs whatever is
  easiest to film); v1 may only exercise the subset of rows with real evidence. No didactic copy.
- Soft-world / cold-instrument contrast still holds after trap or punch-out.
- No clinic/medevac/commander systems shipped; design bible points forward without blocking sorties.

## Follow-ons (out of this pass)

- Full faction / dossier string pass and governance version bump if opposing perspectives become
  playable campaigns.
- FightDirector + ledger single evidence stream.
- Clinic glimpse / medevac / commander phases when sortie loop is proven.
- Passive EW / exclusion-zone / forest-edge fiction as mission content, not required for ledger v1.

## Implementation order (when planned)

1. Eastern strip placement + heading + contact geometry (Intercept + Circuits).
2. Deterministic points ledger over existing debrief events + thin UI slip.
3. Municipal copy / mission header pass.
4. Manual fly-check: launch west into theatre, recover east, ledger readable.
