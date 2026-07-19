# Presentation helpers

This directory contains render-only adapters. They consume projected simulation snapshots and
Three.js objects, never mutate gameplay state, and own/dispose every GPU resource they create.

## Production integration

Import the package beside the other renderer modules:

```js
import {
  attachPeriodGunsightToSemanticAnchor,
  createCockpitHeadPresentation,
  createDistantAircraftImpostor,
  createPeriodGunsight,
} from "./render/presentation/index.js";
```

Create the controllers once in `FlightView` after the camera/scene exist:

```js
this.cockpitHead = createCockpitHeadPresentation(THREE);
this.periodGunsight = createPeriodGunsight(THREE);
this.banditContact = createDistantAircraftImpostor(THREE);
this.scene.add(this.periodGunsight.object3d, this.banditContact.object3d);
this.gunsightAnchor = null;
```

### Cockpit motion order

In the non-replay camera branch, establish the base camera position from the semantic
`camera.cockpit` anchor and establish its aircraft/gimbal quaternion first. Immediately before the
existing `camera.updateMatrixWorld(true)` call, apply:

```js
this.cockpitHead.update(this.camera, state, dt);
```

The base camera pose must be rebuilt every frame; the helper adds a local presentation offset. Call
`this.cockpitHead.reset(state)` on sortie/session discontinuities. Reduced motion is detected from
`prefers-reduced-motion`; tests and settings menus can override it with
`{ reducedMotion: true }` in the update options.

### Period reflector sight

After `presentationAssets.sync(state)` (and whenever the cockpit instance may have swapped), resolve
only the semantic anchor:

```js
const nextSightAnchor = this.presentationAssets.semanticAnchor(
  this.presentationAssets.cockpitSlot,
  "gunsight.origin",
);
if (nextSightAnchor !== this.gunsightAnchor) {
  this.periodGunsight.detach();
  this.gunsightAnchor = nextSightAnchor;
  if (nextSightAnchor) {
    attachPeriodGunsightToSemanticAnchor(
      this.periodGunsight,
      (id) => this.presentationAssets.semanticAnchor(
        this.presentationAssets.cockpitSlot,
        id,
      ),
    );
  }
}
this.periodGunsight.update(this.camera, state, dt);
```

The shader derives angular coordinates from camera-to-combiner rays and the anchor's world
boresight. Eye motion therefore moves the image across the glass while the aim direction remains
fixed at infinity. The sight follows the anchor's world transform but remains outside the cockpit
asset subtree, so releasing a swapped GLB cannot accidentally dispose its shader resources. Once
enabled in production, suppress only the canvas HUD's fixed boresight ring; retain its projected
lead pipper and combat cues.

### Honest distant contact

Delete the range-derived `targetRoot.scale.setScalar(scale)` presentation assist and retain:

```js
targetRoot.scale.setScalar(1);
```

After setting the bandit position/quaternion and updating its world matrix, sample the real
projected extent before hiding anything, then update the contact:

```js
const projectedPixels = this.presentationAssets.projectedPixels(
  this.presentationAssets.targetSlot,
  descriptor, // the resolved target descriptor, when available
);
const contact = this.banditContact.update({
  camera: this.camera,
  target: targetRoot,
  projectedPixels,
  viewportHeight: this.renderer.domElement.clientHeight || window.innerHeight,
  deltaSeconds: dt,
  visible: banditBodyPresent,
  targetDiameterMetres: this.presentationAssets.targetSlot.boundingSphereDiameterMetres ?? 12,
});
targetRoot.visible = banditBodyPresent && contact.modelVisible;
```

If exposing the descriptor at this call site would widen the asset-manager API, omit
`projectedPixels`: the helper computes the honest projection from `targetDiameterMetres`, camera
depth, FOV, and viewport height. The contact uses an 8 px floor, a 14 px ceiling, 10/14 px
hysteresis, and a short cross-fade. It is depth-tested and never changes the model's transform.

### Cleanup

On renderer teardown or content-view replacement:

```js
this.periodGunsight.dispose();
this.banditContact.dispose();
```

Cockpit motion owns no GPU resources.

## Optional carrier escort station

`escort_formation.js` provides a deterministic port- or starboard-quarter presentation pose from
`cx`, `cz`, and `cheading`. It deliberately supplies no ship physics; simulation truth should
replace it if escorts later become interactive.

## Multiplayer contacts

Remote pilots and server-world bogeys retain their projected `presentationId` and resolve through
the active pack's shared registry and projected-pixel LOD policy. Each instance remains at physical
scale. A separate depth-tested 8–14 pixel impostor provides the distant readability floor for live
aircraft; destroyed bodies keep their physical model throughout terminal motion. Dynamic instances,
impostors, labels, and pending registry loads are released when contacts leave or the view shuts
down. Historical replay hides live room traffic without freezing its incoming pose stream.

## Tests

```sh
cd web/wwwroot/render/presentation
npm test
```
