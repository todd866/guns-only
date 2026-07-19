# Korea gun and wake effects

`korea_gun_effects.js` consumes the pack-local `guns.effects.json` profile and provides a presentation-only pooled scene group. It handles the stable gun-fire, gun-impact, vehicle-destroyed, and platform-wake event IDs without importing simulation code.

```js
const effects = await loadKoreaGunEffects(THREE, { qualityTier: "balanced" });
scene.add(effects.group);
effects.emit("event.weapon.gun-fire.v1", { position, direction, tracer: true });
effects.update(deltaSeconds);
```

Seeds make impact and destruction scatter reproducible for screenshots and replay. Quality tiers change particle counts and dynamic muzzle lighting. Call `dispose()` when replacing the pack or renderer.

Open `../../effects-lab/index.html` through a local web server to inspect every event, switch quality tiers, slow presentation time, and verify live particle/draw counts against the real Three r160 runtime.
