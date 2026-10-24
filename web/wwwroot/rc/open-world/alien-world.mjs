// Three alien-world courses in a separate shared metre frame.  The hub and its
// approach roads stay at y=0; elevated course segments are connected by authored
// ramps rather than relying on invisible bridges.
const route = (points, name, reference, hazards, half = 12) => ({
  id: name, name: reference, location: 'lab', alien: true, kind: 'circuit',
  points, half, medals: [70, 90, 120], hazards,
});

export const ALIEN_LOCATIONS = Object.freeze([
  { id: 'lunar-paddock', name: 'Lunar Paddock', short: 'Lunar Paddock', pos: [10000, 0, 200], color: '#b5c9ec', icon: '◇', kind: 'race', event: 'lunar-paddock', alien: true },
  { id: 'comet-quarry', name: 'Comet Quarry', short: 'Comet Quarry', pos: [10400, 0, 200], color: '#e7a36d', icon: '◇', kind: 'race', event: 'comet-quarry', alien: true },
  { id: 'gravity-garden', name: 'Gravity Garden', short: 'Gravity Garden', pos: [10800, 0, 200], color: '#8ad6bb', icon: '◇', kind: 'race', event: 'gravity-garden', alien: true },
]);

export const ALIEN_EVENTS = Object.freeze([
  route([[9940, 200, 0], [9970, 140, 0], [10030, 140, 0], [10070, 200, 0], [10030, 260, 0], [9970, 260, 0], [9940, 200, 0]], 'lunar-paddock', 'Lunar Paddock', ['crater lip', 'crystal gate']),
  route([[10340, 200, 0], [10370, 140, 0], [10440, 130, 0], [10470, 200, 0], [10440, 270, 0], [10370, 260, 0], [10340, 200, 0]], 'comet-quarry', 'Comet Quarry', ['rolling comet stones', 'dust berms']),
  // The crest is broad enough for a momentum carrying kart while retaining a clear
  // descending approach back to the hub.
  route([[10740, 200, 0], [10770, 140, 1], [10830, 140, 1], [10870, 200, 2], [10830, 260, 3], [10770, 260, 2], [10740, 200, 0]], 'gravity-garden', 'Gravity Garden', ['low-gravity crest', 'floating seed pods'], 16),
]);

export const ALIEN_WORLD = Object.freeze({ locations: ALIEN_LOCATIONS, events: ALIEN_EVENTS, hub: [10000, 0, 200] });
