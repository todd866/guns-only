// Four authored MK64 battle spaces. Coordinates are in the shared Saucer Springs X/Z frame;
// each arena is beside an existing venue so Free Drive can reach it without a scene switch.
const loop = (cx, cz, r, n = 16) =>
  Array.from({length: n + 1}, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  });
const rect = (cx, cz, w, d) => [
  [cx - w / 2, cz - d / 2],
  [cx + w / 2, cz - d / 2],
  [cx + w / 2, cz + d / 2],
  [cx - w / 2, cz + d / 2],
  [cx - w / 2, cz - d / 2]
];

export const BATTLE_ARENAS = Object.freeze([
  {
    id: 'fuel-depot-ring',
    name: 'Fuel Depot Ring',
    location: 'bx',
    source: 'Big Donut',
    center: [-760, 900],
    kind: 'arena',
    battle: true,
    points: loop(-760, 900, 34),
    half: 4,
    primarySurface: 'concrete',
    levels: [0],
    startY: 0,
    ramps: [],
    description: 'A broad service ring around a fenced fuel island, with four item bays and no dead ends.'
  },
  {
    id: 'bx-pallet-forts',
    name: 'BX Pallet Forts',
    location: 'bx',
    source: 'Block Fort',
    center: [-400, 900],
    kind: 'arena',
    battle: true,
    points: rect(-400, 900, 14, 14),
    half: 4,
    primarySurface: 'wood',
    levels: [0, 3, 6],
    startY: 0,
    ramps: [
      {from: 0, to: 1.6, gradient: 0.12},
      {from: 1.6, to: 3.36, gradient: 0.12},
      {from: 3.36, to: 6.56, gradient: 0.18}
    ],
    description: 'Four coloured pallet forts with three heights, perimeter ramps, and narrow bridges.'
  },
  {
    id: 'hq-parking-decks',
    name: 'HQ Parking Decks',
    location: 'gate',
    source: 'Double Deck',
    center: [-150, 220],
    kind: 'arena',
    battle: true,
    points: rect(-150, 220, 58, 38),
    half: 4,
    primarySurface: 'concrete',
    levels: [0, 3.5, 7],
    startY: 3.5,
    ramps: [
      {from: 0, to: 3.5, gradient: 0.16},
      {from: 3.5, to: 7, gradient: 0.16}
    ],
    description: 'Three open parking levels with central openings and alternating-side escape ramps.'
  },
  {
    id: 'hangar-roof-deck',
    name: 'Hangar Roof Deck',
    location: 'hangars',
    source: 'Skyscraper',
    center: [500, 600],
    kind: 'arena',
    battle: true,
    points: rect(500, 600, 44, 34),
    half: 4,
    primarySurface: 'metal',
    levels: [0, 5.5],
    startY: 5.5,
    ramps: [{from: 0, to: 5.5, gradient: 0.25}],
    description:
      'A compact raised maintenance roof with a central opening, ledges, and a permanent service ramp.'
  }
]);

export const BATTLE_EVENTS = Object.freeze(
  BATTLE_ARENAS.map(a => ({
    id: a.id,
    name: a.name,
    location: a.location,
    kind: 'arena',
    battle: true,
    source: a.source,
    points: a.points.map(([x, z]) => [x, z, a.startY]),
    clearingBounds: [a.center[0] - 65, a.center[1] - 65, a.center[0] + 65, a.center[1] + 65],
    half: a.half,
    medals: [0, 0, 0],
    description: a.description
  }))
);

export const battleArenaById = id => BATTLE_ARENAS.find(a => a.id === id);
