# Plate 03 — Loft stations

**Airframe:** `rapier.public-data-surrogate.v1` @ `1.4.0`  
**Source:** `airframes/rapier.v1.json` · frame `threejs-createRapier-v1` (+Z aft)  
**Epistemic:** geometry **closed** (surrogate OML)

Stations are copied 1:1 from the definition. Do not edit this table without bumping the JSON revision.

## Fuselage (`fuselage.stations`)

| # | z (m) | rx (m) | ry (m) | y (m) | top (y+ry) | bottom (y−ry) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | −6.50 | 0.03 | 0.03 | 0.03 | 0.06 | 0.00 |
| 1 | −5.65 | 0.34 | 0.30 | 0.05 | 0.35 | −0.25 |
| 2 | −3.60 | 0.60 | 0.52 | 0.08 | 0.60 | −0.44 |
| 3 | −0.60 | 0.76 | 0.66 | 0.08 | 0.74 | −0.58 |
| 4 | 2.90 | 0.72 | 0.60 | 0.06 | 0.66 | −0.54 |
| 5 | 5.55 | 0.48 | 0.40 | 0.05 | 0.45 | −0.35 |
| 6 | 6.50 | 0.24 | 0.22 | 0.04 | 0.26 | −0.18 |

Overall length from nose station z=−6.5 to aft z=+6.5 = **13 m** (`dimensionsM.length`).

## Escape-pod spine (`escapePodSpine.stations`)

| # | z (m) | rx (m) | ry (m) | y (m) |
| --- | ---: | ---: | ---: | ---: |
| 0 | −3.95 | 0.12 | 0.08 | 0.48 |
| 1 | −2.75 | 0.43 | 0.30 | 0.56 |
| 2 | −0.35 | 0.48 | 0.34 | 0.58 |
| 3 | 1.05 | 0.24 | 0.16 | 0.48 |

## Propulsion tunnel (`propulsionTunnel.stations`)

| # | z (m) | rx (m) | ry (m) | y (m) |
| --- | ---: | ---: | ---: | ---: |
| 0 | −3.68 | 0.50 | 0.34 | −0.20 |
| 1 | −1.90 | 0.58 | 0.40 | −0.18 |
| 2 | 4.90 | 0.52 | 0.36 | −0.14 |
| 3 | 6.10 | 0.34 | 0.28 | −0.10 |

## Section sketches (side, scale 40 px/m)

Nose left (−Z). Vertical = body Y.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" font-family="IBM Plex Mono, monospace">
  <rect width="100%" height="100%" fill="#f7f4ef"/>
  <text x="12" y="18" font-size="11" font-weight="700">Fuselage loft — side envelope</text>
  <path d="M 40.0,113.6 L 74.0,102.0 L 156.0,92.0 L 276.0,86.4 L 416.0,89.6 L 522.0,98.0 L 560.0,105.6 L 560.0,123.2 L 522.0,130.0 L 416.0,137.6 L 276.0,139.2 L 156.0,133.6 L 74.0,126.0 L 40.0,116.0 Z"
        fill="#596b73" fill-opacity="0.35" stroke="#1a1a1a" stroke-width="1.2"/>
  <!-- station ticks at each z -->
  <g stroke="#c45c26" stroke-dasharray="2 2">
    <line x1="40" y1="100" x2="40" y2="132"/><!-- z=-6.5 -->
    <line x1="74" y1="88" x2="74" y2="140"/>
    <line x1="156" y1="76" x2="156" y2="148"/>
    <line x1="276" y1="70" x2="276" y2="154"/>
    <line x1="416" y1="74" x2="416" y2="150"/>
    <line x1="522" y1="84" x2="522" y2="144"/>
    <line x1="560" y1="96" x2="560" y2="132"/>
  </g>
  <text x="40" y="200" font-size="9" fill="#555">z=−6.5</text>
  <text x="250" y="200" font-size="9" fill="#555">z=−0.6 (max section)</text>
  <text x="520" y="200" font-size="9" fill="#555">z=+6.5</text>
  <line x1="40" y1="170" x2="560" y2="170" stroke="#222"/>
  <text x="300" y="186" text-anchor="middle" font-size="10">13 m</text>
</svg>
```

Path vertices = `(z − (−6.5)) × 40` horizontally and `116 − (y±ry)×40` vertically from the table above.

## Cross-section at max station (z = −0.6)

`rx = 0.76 m`, `ry = 0.66 m`, centre `y = 0.08 m`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 200" width="280" height="200" font-family="IBM Plex Mono, monospace">
  <rect width="100%" height="100%" fill="#f7f4ef"/>
  <text x="12" y="18" font-size="11" font-weight="700">Section @ z=−0.6</text>
  <ellipse cx="140" cy="100" rx="76" ry="66" fill="#596b73" fill-opacity="0.4" stroke="#1a1a1a"/>
  <line x1="140" y1="34" x2="140" y2="166" stroke="#999" stroke-dasharray="3 2"/>
  <line x1="64" y1="100" x2="216" y2="100" stroke="#999" stroke-dasharray="3 2"/>
  <text x="140" y="190" text-anchor="middle" font-size="9">scale 100 px/m · rx 0.76 · ry 0.66</text>
</svg>
```

## Notes

- Wing planform polyline is on **Plate 02**; fin planform is in JSON `fins[0].planform` (not restated here).
- Loft helpers in the renderer consume these stations directly via `createAirframeFromDefinition`.
