# Scenery flicker — depth probe notes

## Production (still broken as of check)
`https://guns-only.vercel.app/app.js?v=149` constructs `WebGLRenderer` **without**
`logarithmicDepthBuffer`. Reproducing flicker on production after the local fix is expected.

## Local harness (post-fix)
Coplanar 78 m apron vs ground, camera at 20 km slant:

| mode | logDepth | pixel churn across 8 micro-moves |
|------|----------|-----------------------------------|
| linear (current prod) | false | 491696 |
| logarithmic (fix) | true | 0 |

`fixWins: true`. Linear depth LSB at 20 km ≈ 397 m ≫ 78 m apron height.

## Fix location
`web/wwwroot/app.js` — `logarithmicDepthBuffer: true` on the production renderer.
