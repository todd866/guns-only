# Beat 7 wave cohort comparison

Validation contract and test counts: [validation.md](validation.md). Counts include censored/incomplete runs explicitly; baseline wave fields are inferred as two wins only when `combatComplete` is true. Outcome counts sum to 30; landed is a separate overlapping count. [Per-seed ace gates](ace-gates.png).

| pilot | cohort | mean perceived / sim | combat share (pooled phase seconds) | max raw dead air | max active dead air (RTB AP excluded) | hits taken runs | loss/crash/win/draw/recovered/incomplete | landed | waves mean/max | score mean | bounce actual |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| clone | baseline | 50.8s / 50.8s | 88.5% | 38.0s | N/A | 0/30 (0.0%) | 0/30/0/0/0/0 | 0 | 0.00/0 | N/A | N/A |
| clone | waves | 50.8s / 50.8s | 88.5% | 38.0s | 38.0s | 0/30 (0.0%) | 0/30/0/0/0/0 | 0 | 0.00/0 | 0.0 | 0 |
| novice | baseline | 844.2s / 1845.3s | 64.9% | 532.1s | N/A | 8/30 (26.7%) | 4/0/0/0/26/0 | 26 | 0.00/0 | N/A | N/A |
| novice | waves | 2342.0s / 2792.2s | 94.1% | 2380.4s | 2380.4s | 10/30 (33.3%) | 6/0/0/0/4/20 | 4 | 0.00/0 | 0.0 | 10 |
| ace | baseline | 206.3s / 530.2s | 8.9% | 66.1s | N/A | 0/30 (0.0%) | 0/0/30/0/0/0 | 30 | 2.00/2 | N/A | N/A |
| ace | waves | 468.2s / 468.2s | 86.8% | 151.1s | 151.1s | 30/30 (100.0%) | 29/0/0/1/0/0 | 0 | 2.37/4 | 256.7 | 0 |

## Gates (actual versus targets)

- ace mean perceived sortie target 300–480 s: PASS (468.2s)
- Individual ace sorties in 300–480 s band: 8/30; range 138.0–2352.1s. The mean gate does not imply every seed meets the band.
- ace combat share target ≥40%: PASS (86.8%)
- ace maximum active dead air target ≤30 s: MISS (151.1s)
- ace hit evidence (player hits taken): 30/30 (100.0%) — meaningful share is reported for judgment; no arbitrary pass cutoff is applied
- ace combat loss evidence: 29 loss runs
- ace crash evidence: 0 crash runs
- novice first-two completion count target >0: MISS (0)
- novice at-least-one-wave-win: MISS
- All-pilot maximum dead air excluding actual RTB AP: 2380.4s versus ≤30 s target.
