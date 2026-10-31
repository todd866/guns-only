// Authored Wavepool Beach route data. Coordinates are world X/Z (the stream uses X/Z as-is).
// The loop deliberately leaves the existing Splash Down checkpoints untouched while adding
// readable MK64-style landmarks and one optional sandbar line.
export const WAVEPOOL_BEACH = Object.freeze({
  id: 'wavepool-beach',
  location: 'waterpark',
  start: [-545, 3388],
  route: Object.freeze([
    [-545, 3388],
    [-481, 3388],
    [-465, 3370],
    [-465, 3340],
    [-490, 3340],
    [-530, 3340],
    [-545, 3310],
    [-590, 3310],
    [-625, 3340],
    [-625, 3370],
    [-609, 3388],
    [-545, 3388]
  ]),
  // A clean MK64 corner cut: it departs at checkpoint 1 and rejoins at checkpoint 2.
  // Entries are [x, z, deckY] so the visual ramp and collision can share the same profile.
  // Keep the crest shallow at RC scale: it is a wet sandbar cut, not a launch ramp.
  sandbarShortcut: Object.freeze([
    [-481, 3388, 0.025],
    [-473, 3378, 0.025],
    [-465, 3370, 0.025]
  ]),
  sandbarFromCheckpoint: 1,
  sandbarToCheckpoint: 2,
  landmarks: Object.freeze({
    rockTunnel: [-590, 3340],
    wavePool: [-545, 3365],
    slides: [-575, 3412],
    lifeguardTower: [-505, 3410]
  })
});

// `dirt` is the existing grounded, low-grip surface response; the visuals still read as sand.
export const WAVEPOOL_SURFACES = Object.freeze({water: 'water', sand: 'dirt', route: 'asphalt'});
