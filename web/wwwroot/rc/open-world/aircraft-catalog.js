import {heroTemplate} from './hero-assets.js';
import * as T from '../../vendor/three.module.js';
// Authored low-poly approximations (epistemic: fictional art geometry).
const D = {
  'F-16': [15.1, 9.5, 5.1, 1, 'fighter'],
  'F-15C': [19.4, 13.1, 5.6, 2, 'fighter'],
  'F-15E': [19.4, 13.1, 5.6, 2, 'strike'],
  'F-22': [18.9, 13.6, 5.1, 2, 'fighter'],
  'F-35A': [15.7, 10.7, 4.3, 1, 'fighter'],
  'A-10': [16.3, 17.5, 4.5, 2, 'attack'],
  'B-52': [48.5, 56.4, 12.4, 8, 'bomber'],
  'KC-135': [41.5, 39.9, 12.7, 4, 'tanker'],
  'E-3 AWACS': [46.6, 44.4, 12.7, 4, 'awacs'],
  'C-17': [53, 51.8, 16.8, 4, 'transport'],
  'EA-18G': [18.3, 13.7, 4.9, 2, 'strike'],
  Typhoon: [15.9, 10.9, 5.3, 2, 'canard'],
  Rafale: [15.3, 10.9, 5.3, 2, 'canard'],
  Gripen: [14.9, 8.4, 4.5, 1, 'canard'],
  Tornado: [17.2, 13.9, 5.9, 2, 'strike'],
  'Su-27': [21.9, 14.7, 5.9, 2, 'fighter'],
  'MQ-9': [11, 20, 3.8, 1, 'drone'],
  'F-105': [19.6, 10.6, 6.1, 1, 'fighter'],
  'F-4': [19.2, 11.7, 5, 2, 'fighter'],
  'F-100': [15.2, 11.8, 4.6, 1, 'fighter'],
  'F-111': [22.4, 19.2, 5.2, 2, 'strike'],
  'F-117': [20.1, 13.2, 3.8, 2, 'stealth'],
  'MiG-21': [14.7, 7.2, 4.1, 1, 'fighter'],
  'MiG-23': [16.7, 7.8, 4.8, 1, 'fighter'],
  'MiG-29': [17.3, 11.4, 4.7, 2, 'fighter']
};
export const AIRCRAFT_TYPES = Object.freeze(Object.keys(D));
function prism(points, depth) {
  const s = new T.Shape();
  s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  return new T.ExtrudeGeometry(s, {depth, bevelEnabled: false});
}
export function createAircraft(type) {
  const v = D[type];
  if (!v) throw new Error(`Unknown aircraft type: ${type}`);
  const [length, span, height, engines, role] = v,
    baked = heroTemplate(type);
  if (baked) {
    baked.name = type;
    baked.userData = {
      type,
      role,
      epistemic: 'fiction',
      dimensions: {length, span, height},
      engineCount: engines,
      baked: true,
      materials: []
    };
    baked.traverse(o => {
      if (o.material) baked.userData.materials.push(o.material);
    });
    return baked;
  }
  const g = new T.Group();
  g.name = type;
  g.userData = {
    type,
    role,
    epistemic: 'fiction',
    dimensions: {length, span, height},
    engineCount: engines,
    features: []
  };
  const mats = new Map(),
    mat = c => {
      if (!mats.has(c)) mats.set(c, new T.MeshStandardMaterial({color: c, roughness: 0.72}));
      return mats.get(c);
    };
  const add = (geo, x, y, z, c = '#9aa9aa', name = '') => {
    const m = new T.Mesh(geo, mat(c));
    m.position.set(x, y, z);
    m.name = name;
    if (name) g.userData.features.push(name);
    g.add(m);
    return m;
  };
  const body = add(
    type === 'F-117'
      ? prism(
          [
            [0, -length * 0.35],
            [-span * 0.18, -length * 0.05],
            [0, length * 0.35],
            [span * 0.18, -length * 0.05]
          ],
          height * 0.5
        )
      : new T.CylinderGeometry(height * 0.12, height * 0.18, length * 0.62, 10),
    0,
    0,
    0,
    '#87999b',
    'fuselage'
  );
  body.rotation.x = Math.PI / 2;
  const nose = add(
    new T.ConeGeometry(height * 0.18, length * 0.28, 10),
    0,
    0,
    -length * 0.45,
    '#aab5b0',
    'nose'
  );
  nose.rotation.x = -Math.PI / 2;
  const half = span / 2,
    delta = ['Typhoon', 'Rafale', 'Gripen', 'MiG-21', 'F-117'].includes(type),
    diamond = ['F-22', 'F-35A'].includes(type),
    straight = role === 'attack' || role === 'drone',
    sweep =
      type === 'F-111' || type === 'Tornado' || type === 'MiG-23' ? 0.24 : role === 'bomber' ? 0.2 : 0.1,
    pts = straight
      ? [
          [0, -length * 0.05],
          [-half, -length * 0.02],
          [-half, length * 0.07],
          [0, length * 0.12]
        ]
      : delta
        ? [
            [0, -length * 0.24],
            [-half, length * 0.22],
            [0, length * 0.22]
          ]
        : diamond
          ? [
              [0, -length * 0.16],
              [-half, length * 0.06],
              [-half * 0.65, length * 0.23],
              [0, length * 0.26]
            ]
          : [
              [0, -length * 0.12],
              [-half, length * sweep],
              [-half * 0.9, length * (sweep + 0.09)],
              [0, length * 0.2]
            ];
  for (const side of [-1, 1]) {
    const w = add(
      prism(
        pts.map(([x, z]) => [x * side, z]),
        height * 0.05
      ),
      0,
      -height * 0.03,
      0,
      '#71868b',
      'wing'
    );
    w.rotation.x = Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    const tail = add(
      prism(
        [
          [0, length * 0.22],
          [side * span * 0.2, length * 0.3],
          [side * span * 0.13, length * 0.4],
          [0, length * 0.34]
        ],
        height * 0.05
      ),
      0,
      height * 0.12,
      0,
      '#667b80',
      'tailplane'
    );
    tail.rotation.x = Math.PI / 2;
  }
  const canopy = add(new T.SphereGeometry(1, 12, 8), 0, height * 0.18, -length * 0.19, '#284d60', 'canopy');
  canopy.scale.set(
    height * 0.105,
    height * 0.12,
    length * (type === 'F-15E' || type === 'F-4' || type === 'F-111' ? 0.15 : 0.1)
  );
  const finish = {
    'F-15E': '#687b86',
    'F-22': '#7f929c',
    'F-35A': '#788c94',
    'A-10': '#82948c',
    'Su-27': '#819eac',
    'F-117': '#35434e',
    Typhoon: '#b7bec0',
    Rafale: '#a3afb1',
    Gripen: '#92a8a4'
  }[type];
  if (finish) {
    body.material = mat(finish);
    for (const w of g.children.filter(o => o.name === 'wing')) w.material = mat(finish);
  }
  if (role === 'fighter' || role === 'strike' || role === 'canard') {
    const sides =
      type === 'F-15C' ||
      type === 'F-15E' ||
      type === 'F-22' ||
      type === 'F-35A' ||
      type === 'EA-18G' ||
      type === 'MiG-29' ||
      type === 'Su-27'
        ? [-1, 1]
        : [0];
    for (const side of sides) {
      const f = add(
        prism(
          [
            [0, 0],
            [length * 0.1, height * 0.52],
            [length * 0.18, height * 0.48],
            [length * 0.2, 0]
          ],
          height * 0.045
        ),
        side * height * 0.13,
        height * 0.08,
        length * 0.18,
        '#52676d',
        'fin'
      );
      f.rotation.order = 'ZYX';
      f.rotation.y = -Math.PI / 2;
      f.rotation.z = side * 0.16;
    }
  }
  if (role === 'canard')
    for (const side of [-1, 1]) {
      const c = add(
        prism(
          [
            [0, 0],
            [-span * 0.14, -length * 0.08],
            [-span * 0.08, -length * 0.02],
            [0, length * 0.02]
          ],
          height * 0.04
        ),
        side * span * 0.12,
        height * 0.08,
        -length * 0.18,
        '#80989a',
        'canard'
      );
      c.rotation.x = Math.PI / 2;
    }
  if (role === 'attack') {
    g.userData.features.push('straight-wing', 'high-mounted-twin-engines');
    for (const side of [-1, 1]) {
      const e = add(
        new T.CylinderGeometry(height * 0.13, height * 0.15, length * 0.24, 8),
        side * span * 0.12,
        height * 0.3,
        length * 0.25,
        '#343e41',
        'engine'
      );
      e.rotation.x = Math.PI / 2;
    }
  } else if (role === 'drone') {
    g.userData.features.push('high-aspect-wing', 'propeller', 'v-tail');
    for (const a of [0, Math.PI / 2]) {
      const p = add(
        new T.BoxGeometry(height * 0.65, height * 0.06, height * 0.04),
        0,
        0,
        length * 0.4,
        '#2a3538',
        'propeller-blade'
      );
      p.rotation.z = a;
    }
    for (const side of [-1, 1]) {
      const t = add(
        new T.BoxGeometry(span * 0.04, height * 0.4, length * 0.14),
        side * span * 0.12,
        height * 0.3,
        length * 0.28,
        '#586c70',
        'v-tail'
      );
      t.rotation.z = side * 0.5;
    }
  } else {
    const n =
      role === 'bomber' ? 8 : role === 'awacs' || role === 'tanker' || role === 'transport' ? 4 : engines;
    for (let i = 0; i < n; i++) {
      const side = (i % 2) * 2 - 1,
        j = Math.floor(i / 2),
        xx =
          role === 'bomber'
            ? side * (span * (0.19 + Math.floor(j / 2) * 0.17) + ((j % 2) - 0.5) * height * 0.23)
            : side *
              span *
              (role === 'awacs' || role === 'tanker' || role === 'transport' ? 0.19 + j * 0.16 : 0.055),
        zz =
          length *
          (role === 'bomber'
            ? 0.1 + Math.floor(j / 2) * 0.05
            : role === 'fighter' || role === 'strike' || role === 'canard'
              ? 0.25
              : 0.1 + j * 0.06);
      const e = add(
        new T.CylinderGeometry(height * 0.1, height * 0.12, length * 0.2, 8),
        xx,
        -height * 0.16,
        zz,
        '#303a3c',
        'nacelle'
      );
      e.rotation.x = Math.PI / 2;
    }
    if (role === 'bomber') g.userData.features.push('four-paired-nacelle-pods');
  }
  if (['bomber', 'tanker', 'awacs', 'transport', 'attack', 'stealth'].includes(role))
    for (const side of role === 'attack' || role === 'stealth' ? [-1, 1] : [0]) {
      const f = add(
        prism(
          [
            [0, 0],
            [length * 0.12, height * 0.56],
            [length * 0.2, height * 0.06]
          ],
          height * 0.035
        ),
        side * span * 0.1,
        height * 0.12,
        length * 0.23,
        '#62767d',
        'fin'
      );
      f.rotation.y = -Math.PI / 2;
    }
  if (role === 'awacs') {
    add(
      new T.CylinderGeometry(span * 0.19, span * 0.19, height * 0.07, 24),
      0,
      height * 0.45,
      length * 0.05,
      '#becbd0',
      'radome'
    );
    g.userData.features.push('radome');
  }
  if (type === 'F-117') g.userData.features.push('faceted-body'); // Hero-specific structure: these are real meshes so the silhouettes read at a distance.
  if (['B-52', 'C-17', 'A-10'].includes(type)) {
    const removeNamed = name => {
      for (const m of [...g.children].filter(o => o.name === name)) {
        g.remove(m);
        m.geometry.dispose();
      }
    };
    if (type === 'B-52') {
      for (const side of [-1, 1])
        for (let pair = 0; pair < 2; pair++)
          add(
            prism(
              [
                [0, 0],
                [length * 0.11, 0],
                [length * 0.08, -height * 0.2],
                [length * 0.01, -height * 0.2]
              ],
              0.3
            ),
            side * span * (0.19 + pair * 0.17),
            0,
            length * (0.1 + pair * 0.05) - length * 0.05,
            '#596a70',
            'pylon'
          ).rotation.y = -Math.PI / 2;
    }
    if (type === 'C-17') {
      removeNamed('fuselage');
      removeNamed('nose');
      removeNamed('tailplane');
      const profile = [
        [-length * 0.48, 0.1],
        [-length * 0.44, height * 0.1],
        [-length * 0.35, height * 0.18],
        [-length * 0.2, height * 0.21],
        [length * 0.18, height * 0.21],
        [length * 0.32, height * 0.14],
        [length * 0.4, height * 0.04]
      ].map(([z, r]) => new T.Vector2(r, z));
      const hull = add(new T.LatheGeometry(profile, 24), 0, 0, 0, '#92a1a2', 'cargo-fuselage');
      hull.rotation.x = Math.PI / 2;
      for (const w of g.children.filter(o => o.name === 'wing')) w.position.y = height * 0.17;
      for (const side of [-1, 1]) {
        const t = add(
          prism(
            [
              [0, 0],
              [side * span * 0.23, length * 0.08],
              [side * span * 0.2, length * 0.14],
              [0, length * 0.08]
            ],
            0.25
          ),
          0,
          height * 0.65,
          length * 0.29,
          '#73888d',
          'T-tailplane'
        );
        t.rotation.x = Math.PI / 2;
      }
      for (const side of [-1, 1]) {
        const pod = add(
          new T.SphereGeometry(1, 16, 10),
          side * height * 0.18,
          -height * 0.13,
          length * 0.06,
          '#829496',
          'gear-sponson'
        );
        pod.scale.set(height * 0.1, height * 0.1, length * 0.17);
      }
    }
    if (type === 'A-10') {
      removeNamed('nose');
      removeNamed('fin');
      const nose = add(new T.SphereGeometry(1, 20, 12), 0, 0, -length * 0.34, '#87999b', 'blunt-nose');
      nose.scale.set(height * 0.18, height * 0.16, length * 0.14);
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7,
          gun = add(
            new T.CylinderGeometry(0.025, 0.025, 0.65, 6),
            Math.cos(a) * 0.07,
            -height * 0.08 + Math.sin(a) * 0.07,
            -length * 0.48,
            '#293338',
            'gun-barrel'
          );
        gun.rotation.x = Math.PI / 2;
      }
      for (const side of [-1, 1]) {
        const f = add(
          prism(
            [
              [0, 0],
              [length * 0.02, height * 0.45],
              [length * 0.12, height * 0.4],
              [length * 0.15, 0]
            ],
            0.12
          ),
          side * span * 0.16,
          height * 0.1,
          length * 0.22,
          '#53686d',
          'twin-fin'
        );
        f.rotation.y = -Math.PI / 2;
      }
    }
    const gear =
      type === 'B-52'
        ? [
            [-0.8, 0.05],
            [0.8, 0.05],
            [-0.8, 0.25],
            [0.8, 0.25]
          ]
        : [
            [-span * 0.09, 0.1],
            [span * 0.09, 0.1],
            [0, -length * 0.25]
          ];
    for (const [x, z0] of gear) {
      const z = type === 'B-52' ? z0 * length : z0,
        cy = -height * 0.32;
      add(new T.CylinderGeometry(0.07, 0.09, height * 0.36, 8), x, cy, z, '#b1bfc0', 'landing-strut');
      for (const side of [-1, 1]) {
        const wheel = add(
          new T.CylinderGeometry(height * 0.065, height * 0.065, height * 0.045, 16),
          x + side * height * 0.035,
          -height * 0.5,
          z,
          '#20282b',
          'landing-wheel'
        );
        wheel.rotation.z = Math.PI / 2;
        const hub = add(
          new T.CylinderGeometry(height * 0.025, height * 0.025, height * 0.047, 12),
          x + side * height * 0.035,
          -height * 0.5,
          z,
          '#82989b',
          'wheel-hub'
        );
        hub.rotation.z = Math.PI / 2;
      }
    }
  }
  g.userData.materials = [...mats.values()];
  return g;
}
export function disposeAircraft(g) {
  const ms = new Set(g.userData.materials || []);
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
  });
  ms.forEach(m => m.dispose());
}
