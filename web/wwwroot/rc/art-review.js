import * as T from '../vendor/three.module.js';
// Original authored review pass. Opt-in until actual captures establish acceptance.
export function applyArtReview({scene, car, hangar, renderer, sun, contactSun}) {
  const paint = {
    shell: ['#c95c16', 0.12, 0.34],
    ivory: ['#d3c7a9', 0.03, 0.55],
    graphite: ['#202b30', 0.25, 0.54],
    rubber: ['#111619', 0, 0.92],
    alloy: ['#879b9e', 0.7, 0.32],
    copper: ['#a85a34', 0.55, 0.4],
    glass: ['#173e4b', 0.25, 0.22],
    teal: ['#3f5d60', 0.18, 0.72]
  };
  const adjusted = new Set();
  for (const root of [car, hangar])
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (adjusted.has(m)) continue;
        adjusted.add(m);
        const p = paint[m.name];
        if (p) {
          m.color.set(p[0]);
          m.metalness = p[1];
          m.roughness = p[2];
        }
        m.envMapIntensity = 0.45;
      }
    });
  // A continuous top surface masks the baseline's oversized joint geometry. Thin,
  // low-contrast joints and wear are authored here at physical floor proportions.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#626c6b';
  ctx.fillRect(0, 0, 1024, 1024);
  let seed = 9127;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 18000; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff06' : '#00000007';
    ctx.fillRect(random() * 1024, random() * 1024, 1 + random() * 2, 1);
  }
  ctx.strokeStyle = '#465454';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 11; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * 1024) / 11);
    ctx.lineTo(1024, (i * 1024) / 11);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c39b48';
  ctx.lineWidth = 2.2;
  for (const x of [1024 * (0.5 - 2.5 / 18), 1024 * (0.5 + 2.5 / 18)]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const floor = new T.Mesh(
    new T.PlaneGeometry(18, 22),
    new T.MeshStandardMaterial({map: texture, roughness: 0.76, metalness: 0.04})
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(38, 0.066, -8);
  floor.receiveShadow = true;
  scene.add(floor);
  scene.environmentIntensity = 0.3;
  renderer.toneMappingExposure = 0.95;
  sun.intensity = 2.4;
  contactSun.intensity = 0.8;
  contactSun.shadow.normalBias = 0.002;
  scene.children.filter(o => o.isHemisphereLight).forEach(o => (o.intensity = 0.85));
  const key = scene.children.find(o => o.isSpotLight);
  if (key) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0001;
    key.shadow.normalBias = 0.005;
    key.intensity = 95;
  }
}
