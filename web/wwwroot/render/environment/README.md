# Korea environment renderer

`korea_environment.js` turns the pack-local ocean and atmosphere material profiles into a camera-following Three.js environment. It is presentation-only and consumes no simulation state beyond camera position, elapsed presentation time, and optional sun direction.

The ocean uses three deterministic long waves plus two scrolling normal-map samples, crest foam, view Fresnel, sun glint, and profile fog. The sky uses a haze-aware gradient and analytic sun disc. One or two translucent cloud shells use the pack's seamless four-channel density texture, according to the selected quality tier.

```js
import * as THREE from "../../vendor/three.module.js";
import { loadKoreaEnvironment } from "./korea_environment.js";

const environment = await loadKoreaEnvironment(THREE, {
  qualityTier: "balanced",
});
scene.add(environment.group);

environment.update({
  timeSeconds: performance.now() / 1000,
  cameraPosition: camera.position,
});
```

Call `dispose()` during pack or renderer replacement. It owns its geometry, materials, and loaded textures.
