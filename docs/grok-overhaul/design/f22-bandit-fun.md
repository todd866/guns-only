# F-22 bandit: what "fun" means

Owner decision, 13 October 2026: "make it more fun." Laptop and keyboard are the core
experience; the alternating BFM ladder (`f22-bfm-ladder.md`) is the context. This page
defines the opponent's behaviour in pilot terms and gives a measurable proxy for each part.
All numbers are authored targets, not doctrine or aircraft data.

## The fight, 60–120 s

| Phase | What the player should see |
|---|---|
| 0–15 s | First pass or Present. The bandit is visible and its nose is moving. |
| 15–40 s | **First attack.** It turns toward you, closes, and fires (or would fire) from 120–900 m. |
| After every pass | **It comes back within about 20–30 s.** It does not orbit beyond the gun band or drift out to 4 NM. An extension is a re-attack set-up, nose back on you quickly. |
| Every engagement | One moment of danger (rounds pass close) and one moment of opportunity (it sits in your gun window, or overshoots ahead of your 3–9 line). |

Readable intent: the bandit's nose leads its attack. A lead turn, a high yo-yo or a
reversal is flown smoothly so you can see the lift vector and plane of motion before the
shot arrives. No jitter, no snap reversals.

## Tier personalities

Mistakes are **decision policy**, never physics: worse G discipline, shorter lookahead,
slower recognition, poorer energy judgement. No scripted misses, no rubber-band thrust,
no hit-volume change, no fake G.

| Tier | Pressure | Exploitable mistakes |
|---|---|---|
| Competent | Comes back promptly and commits. Fires on the wide body gate (tracers, near misses). | Over-pulls past corner speed and bleeds energy; overshoots after a hard break; extends in a straight, predictable line; is slow to notice it is defensive. |
| Veteran | Returns faster and holds the gun band. Fewer wasted rounds. | Occasionally over-pulls; fewer overshoots; extends with a turn. |
| Ace | Returns fastest and converts. Fires only on the ballistic solution. | Rarely. Its weakness is honest physics: a max-G pull costs energy you can use. |

Punish the player's mistakes: a flat (level) turn lets the bandit use the vertical; staying
slow lets it gain angles; extending in front of it is a gun shot. These emerge from the
planner scoring real future geometry; we must not suppress them.

## Proxies (sim.Tests `BanditPressureReport`, `FunProxyTracker`)

Measured with Cohort, Competent and GunOpportunity pilots, 4+ seeds, 120 s, rungs 0
(O1 Competent), 2 (N Ace) and lesson O2 (Veteran).

| Proxy | Definition | Target |
|---|---|---|
| First attack | First credible-attack sample (120–900 m, tier cone, trigger or lead envelope) | ≤ 40 s |
| Return time | Gap between credible attacks (samples within 3 s merge) | median ≤ 30 s, worst ≤ 60 s |
| Attacks per minute | Credible-attack episodes / live minutes | ≥ 1.5 |
| Player opportunities | Episodes with the bandit 120–900 m within 10° of the player's nose; plus overshoots (bandit moves from behind the player's 3–9 line to ahead within 900 m) | ≥ 1 per minute at Competent, falling with tier |
| Warning before first hit | Credible attacks and 100 m near-pass rounds before the first hit | ≥ 1 attack before the first hit |

Guards: `GunConversionContractTests` (Ace converts, lower tiers do not), terrain and ceiling
tests, BFM ladder tests, `AiPlannerWorkloadBudgetTests`, and native CPU per live tick within
+15% of Build 378.
