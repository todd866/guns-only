import * as T from '../../vendor/three.module.js';

// One scene group, shared small meshes and one procedural sprite texture; no asset downloads.
export function createArrowView(scene) {
  const root = new T.Group();
  root.name = 'ElectricArrows';
  scene.add(root);
  const keep = [],
    own = x => (keep.push(x), x),
    shafts = new Map(),
    sparks = new Map(),
    shaftGeometry = own(new T.CylinderGeometry(0.018, 0.018, 0.65, 5)),
    tipGeometry = own(new T.ConeGeometry(0.075, 0.17, 5)),
    shaftMaterial = own(new T.MeshBasicMaterial({color: '#ded6b5'})),
    tipMaterial = own(new T.MeshBasicMaterial({color: '#74ddff', toneMapped: false})),
    up = new T.Vector3(0, 1, 0),
    direction = new T.Vector3();
  const size = 16,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        r = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2));
      pixels.set([150, 225, 255, Math.round(255 * Math.max(0, 1 - r) ** 2)], i);
    }
  const texture = own(new T.DataTexture(pixels, size, size));
  texture.needsUpdate = true;
  const glow = own(
    new T.SpriteMaterial({
      map: texture,
      color: '#78cfff',
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  const sprite = (parent, scale) => {
    const s = new T.Sprite(glow);
    s.scale.setScalar(scale);
    parent.add(s);
    return s;
  };
  let time = 0;
  function update(state, stunned, dt = 0) {
    time += dt;
    const ids = new Set(state.arrows.map(a => a.id));
    for (const [id, group] of shafts)
      if (!ids.has(id)) {
        group.removeFromParent();
        shafts.delete(id);
      }
    for (const arrow of state.arrows) {
      let group = shafts.get(arrow.id);
      if (!group) {
        group = new T.Group();
        const shaft = new T.Mesh(shaftGeometry, shaftMaterial),
          tip = new T.Mesh(tipGeometry, tipMaterial);
        shaft.position.y = -0.325;
        tip.position.y = 0.04;
        group.add(shaft, tip);
        sprite(group, 0.42);
        for (let i = 1; i <= 4; i++) sprite(group, 0.3 - i * 0.04).position.y = -i * 0.28;
        root.add(group);
        shafts.set(arrow.id, group);
      }
      group.position.fromArray(arrow.pos);
      group.quaternion.setFromUnitVectors(up, direction.fromArray(arrow.tangent ?? arrow.direction));
    }
    const stunnedIds = new Set(stunned.map(t => t.id));
    for (const [id, group] of sparks)
      if (!stunnedIds.has(id)) {
        group.removeFromParent();
        sparks.delete(id);
      }
    for (const target of stunned) {
      let group = sparks.get(target.id);
      if (!group) {
        group = new T.Group();
        for (let i = 0; i < 6; i++) sprite(group, 0.45);
        root.add(group);
        sparks.set(target.id, group);
      }
      group.position.fromArray(target.pos);
      group.children.forEach((s, i) => {
        const a = i * 2.4 + time * 5;
        s.position.set(Math.cos(a) * 0.75, Math.sin(a * 1.7) * 0.65, Math.sin(a) * 0.75);
        s.visible = Math.sin(time * 35 + i * 3) > -0.35;
        s.scale.setScalar(0.3 + 0.25 * Math.abs(Math.sin(time * 23 + i)));
      });
    }
  }
  return {
    root,
    update,
    dispose() {
      root.removeFromParent();
      root.clear();
      shafts.clear();
      sparks.clear();
      keep.forEach(x => x.dispose());
    }
  };
}
