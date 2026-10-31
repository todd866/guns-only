// The petting zoo: the base's display of foreign jets (owner, 30 Oct: "the petting zoo airplanes
// need to be way better"). The real Nellis has a threat-training display nicknamed the Petting
// Zoo. Here each jet stands in its own roped pen with a plaque; drive up and it wakes like a
// friendly animal (canopy up, rudder wagging, the MiG-23 waves its swing wings) and a toy tells you
// one true thing about it (owner: "passively learn stuff", never a quiz). Data only; drawn by
// open-world/petting-zoo.js. Real sizes in metres; noses face the visitors (+z, south).

export const ZOO = Object.freeze({
  wake: 18, // m from the jet's middle: it wakes up
  tell: 13, // m from the jet's middle: the fact is told (once per jet per visit)
  away: 60, // m from the zoo: it counts as a new visit
  show: 450, // m: beyond this the zoo isn't drawn
  gate: [-1361, 2062]
});

// Facts are kept short and true: each one checked against standard references (production
// totals, wing sweep, the intake doors, the Cobra). Don't add one you can't source.
export const ZOO_JETS = Object.freeze([
  {
    type: 'MiG-21',
    name: 'MiG-21 "Fishbed"',
    at: [-1401, 2024],
    fact: 'More MiG-21s were built than any other supersonic jet: over 11,000!'
  },
  {
    type: 'MiG-23',
    name: 'MiG-23 "Flogger"',
    at: [-1375, 2024],
    fact: 'Its wings swing back to go fast and forward to fly slowly and land.'
  },
  {
    type: 'MiG-29',
    name: 'MiG-29 "Fulcrum"',
    at: [-1349, 2024],
    fact: 'On the ground it shuts its big air intakes and breathes through slots on top, so it won’t swallow stones.'
  },
  {
    type: 'Su-27',
    name: 'Su-27 "Flanker"',
    at: [-1323, 2024],
    fact: 'It can rear up on its tail in mid-air and keep flying. Pilots call that trick the Cobra.'
  }
]);
export const ZOO_SIGN =
  'Pilots at the real Nellis base study other countries’ jets up close at a display nicknamed the Petting Zoo.';

// The old display (baked into landmarks.glb before this zoo existed) stood in this box; the
// baked mesh is cut here so the new jets don't stand inside the old ones. [x0, z0, x1, z1, yMin].
export const OLD_DISPLAY_CUT = Object.freeze([-1416, 2008, -1308, 2042, 0.08]);

export function createZooState() {
  return {told: new Set(), awake: new Map(), lastNear: -Infinity, signTold: false};
}

/** Which jets are awake (0..1 eased elsewhere) and what to tell. pos = the car's world position. */
export function stepZoo(z, pos, time) {
  const events = [],
    d0 = Math.hypot(pos[0] - ZOO.gate[0], pos[2] - ZOO.gate[1]);
  if (d0 > ZOO.away) {
    z.awake.clear();
    if (time - z.lastNear > 20) {
      z.told.clear();
      z.signTold = false;
    }
    return events;
  }
  z.lastNear = time;
  if (!z.signTold && d0 < 8) {
    z.signTold = true;
    events.push({zoo: 'sign', text: ZOO_SIGN});
  }
  for (const j of ZOO_JETS) {
    const d = Math.hypot(pos[0] - j.at[0], pos[2] - j.at[1]);
    z.awake.set(j.type, d < ZOO.wake);
    if (d < ZOO.tell && !z.told.has(j.type)) {
      z.told.add(j.type);
      events.push({zoo: j.type, name: j.name, text: j.fact});
    }
  }
  return events;
}
