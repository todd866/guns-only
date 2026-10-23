// Authored Wavepool Beach route data. Coordinates are world X/Z (the stream uses X/Z as-is).
// The loop deliberately leaves the existing Splash Down checkpoints untouched while adding
// readable MK64-style landmarks and one optional sandbar line.
export const WAVEPOOL_BEACH = Object.freeze({
  id: 'wavepool-beach',
  location: 'waterpark',
  start: [-545, 3388],
  route: Object.freeze([
    [-545, 3388], [-481, 3388], [-465, 3370], [-465, 3340],
    [-490, 3340], [-530, 3340], [-545, 3310], [-590, 3310],
    [-625, 3340], [-625, 3370], [-609, 3388], [-545, 3388],
  ]),
  // A clean shortcut across the shallow end. It rejoins before the next checkpoint.
  sandbarShortcut: Object.freeze([[-510, 3382], [-535, 3367], [-565, 3367], [-590, 3382]]),
  landmarks: Object.freeze({
    rockTunnel: [-590, 3340],
    wavePool: [-545, 3365],
    slides: [-575, 3412],
    lifeguardTower: [-505, 3410],
  }),
});

export const WAVEPOOL_SURFACES = Object.freeze({ water: 'water', sand: 'sand', route: 'asphalt' });

