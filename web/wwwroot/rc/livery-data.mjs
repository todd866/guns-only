// Livery choices shared by the Garage, saved progress and the renderer (livery.js).
export const LIVERIES = Object.freeze([
  { id: 'solid', name: 'Solid' }, { id: 'stripes', name: 'Racing stripes' }, { id: 'twotone', name: 'Two-tone' },
  { id: 'checker', name: 'Checker' }, { id: 'camo', name: 'Camo' }, { id: 'flames', name: 'Flames' }, { id: 'shark', name: 'Shark mouth' },
  // Added after the owner's son's first long garage session (camo and flames were his favourites).
  { id: 'lightning', name: 'Lightning' }, { id: 'tiger', name: 'Tiger stripes' }, { id: 'stars', name: 'Stars' },
  // Earned by splatting pumpkins (owner, 31 Oct: "a reward for splatting lots of pumpkins"; and
  // the kid loves the six-seven meme, so 67 is the big one).
  { id: 'sixseven', name: 'Six seven', pumpkins: 67 },
  // Earned in the dark world (open-world/outlaws.mjs): free the Lake Town from its outlaw gang.
  { id: 'sheriff', name: 'Sheriff star', earned: 'lakeTown' },
]);
/** Is this livery open to a player with `progress` (pumpkins splatted, all time)? */
export const liveryUnlocked = (l, progress) => l?.earned === 'lakeTown' ? !!progress?.lakeTownFreed : !l?.pumpkins || (progress?.pumpkins ?? 0) >= l.pumpkins;
// The other pumpkin reward is a whole car: a jack-o'-lantern on wheels (vehicle-bodies.js).
export const PUMPKIN_CAR = Object.freeze({ id: 'pumpkin', name: 'Pumpkin car', pumpkins: 20, body: true });
/** Pumpkin milestones crossed going from `before` to `after` splats: what was just earned. */
export const pumpkinRewards = (before, after) => [PUMPKIN_CAR, ...LIVERIES].filter(l => l.pumpkins && before < l.pumpkins && after >= l.pumpkins);
export const TRIMS = Object.freeze([
  { name: 'White', color: '#f4f1e6' }, { name: 'Black', color: '#1d2226' }, { name: 'Race red', color: '#d8322b' },
  { name: 'Hi-vis yellow', color: '#f5d33a' }, { name: 'Electric blue', color: '#2f7de1' }, { name: 'Lime', color: '#77d13b' },
  { name: 'Hot pink', color: '#f05aa6' }, { name: 'Gold', color: '#d6a53a' },
]);
