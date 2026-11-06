// Toy pass: a mapping layer over the realistic flight and chopper presentation.
// Realistic ids, phrases and samples stay where they are. Toy mode (default on)
// reads these tables and substitutes toys. Turning the setting off returns the
// realistic set unchanged.

export const TOY_REJOIN_S = 3;
export const FRIENDLY_SPLAT_CAPTION = "Medic! ...He's fine.";

export const TOY_PALETTE = Object.freeze({
  id: "kids-bright",
  sky: "#9ad7ff",
  fog: "#d4eeff",
  friendlyPlastic: "#3cbf45",
  armyGreen: "#2f9e3a",
  ambulance: "#f4f7fb",
  ambulanceCross: "#e23b3b",
  dart: "#ffe14a",
  balloon: "#ff4f8d",
  paper: "#f4efe4",
  cardboard: "#c4a574",
  brass: "#e2b657",
  paint: Object.freeze(["#ff4d6a", "#3aa0ff", "#ffe14a", "#5dde6a", "#c06bff"]),
});

export const GOOD_GUYS = Object.freeze([
  Object.freeze({
    id: "green-army-man",
    name: "Green army men",
    look: "Classic little green plastic army man with a helmet, a fixed smile and a moulded rifle.",
    behaviour: "Marches out from the spawn and falls over stiff, in the classic plastic pose, when splatted.",
    beat: "Splatting your own army man never fails anything. The toy ambulance takes him home.",
    color: 0x2f9e3a,
    face: true,
    windUpKey: false,
    rubberWheels: false,
  }),
]);

export const BAD_GUYS = Object.freeze([
  Object.freeze({
    id: "wind-up-robot",
    look: "A boxy tin robot with a brass key in its back, red glass eyes and a clockwork walk.",
    behaviour: "Ticks forward in a straight line, leans back, then lunges.",
    beat: "Splat the brass key on its back. It winds down and sits.",
    color: 0xc45a3a,
  }),
  Object.freeze({
    id: "jack-in-the-box",
    look: "A striped crank box with a grumpy face on a spring and a painted frown.",
    behaviour: "Stays shut, then pops up on a steady crank.",
    beat: "Splat the lid before the pop, or bonk the head while it is up.",
    color: 0xf0c43a,
  }),
  Object.freeze({
    id: "rubber-band-sniper",
    look: "A skinny plastic figure in the wrong colour, stretching a rubber band on a clothespin.",
    behaviour: "Holds still, then flicks one rubber band and has to wind up again.",
    beat: "Splat it while the band is stretching so the clothespin snaps shut.",
    color: 0x4a6e8c,
  }),
  Object.freeze({
    id: "evil-teddy",
    look: "A round plush bear with a stitched frown, one button eye and a too-tight bow.",
    behaviour: "Waddles slowly and hugs whatever it can reach, then has to let go.",
    beat: "A water balloon soaks the stuffing. It flops and sits.",
    color: 0x8d4a3a,
  }),
  Object.freeze({
    id: "plastic-dinosaur",
    look: "A chunky moulded dinosaur with a bright belly and a hinged jaw.",
    behaviour: "Stomps in a short charge, then pauses with its mouth open.",
    beat: "Send a paper plane into the open mouth, or paint the belly while it pauses.",
    color: 0x3f8f4a,
  }),
  Object.freeze({
    id: "rc-car-gang",
    look: "Low plastic buggies with rubber wheels, whip antennas and peeling stickers.",
    behaviour: "Circles fast and bumps into things, then has to turn around.",
    beat: "Paint the rubber wheels. They spin out and park.",
    color: 0xe23b3b,
  }),
  Object.freeze({
    id: "balloon-animal-blimp",
    look: "A long twisted balloon animal with a drawn-on face, a string and a floaty tail.",
    behaviour: "Drifts and bobs, so a straight dart is the easy way.",
    beat: "One foam dart pops it. It sinks as a ribbon.",
    color: 0xff4f8d,
  }),
  Object.freeze({
    id: "tin-soldier-wrong-colour",
    look: "A classic tin soldier in a red tunic and a tall hat, the wrong colour for the green squad.",
    behaviour: "Marches in step and pops a cork from a little musket.",
    beat: "Bonk the tall hat. The soldier topples stiff, like a domino.",
    color: 0xb4232c,
  }),
  Object.freeze({
    id: "spinning-top-swarm",
    look: "A swarm of bright spinning tops with painted rings and tiny faces in the caps.",
    behaviour: "Whirls in tight circles, then wobbles when it runs out of spin.",
    beat: "Wait for the wobble, then a dart. The top skitters and lies down.",
    color: 0x3aa0ff,
  }),
  Object.freeze({
    id: "toy-chest-boss",
    look: "A wooden toy chest with a face on the lid and smaller toys spilling over the edge.",
    behaviour: "Stays put and spits out one smaller bad toy on a timer.",
    beat: "Paint the lid until it yawns shut and the toys hop back inside.",
    color: 0x8a5a2b,
  }),
]);

export const GROUND_TARGETS = Object.freeze({
  blocks: Object.freeze({
    id: "toy-blocks",
    label: "Toy blocks",
    color: 0x3aa0ff,
    look: "Chunky painted blocks stacked into a little truck, with rubber wheels.",
    rubberWheels: true,
    windUpKey: false,
    face: false,
  }),
  fort: Object.freeze({
    id: "cardboard-fort",
    label: "Cardboard fort",
    color: 0xc4a574,
    look: "A cardboard fort with crayon battlements and a taped-on gate.",
    rubberWheels: false,
    windUpKey: false,
    face: true,
  }),
  balloonTower: Object.freeze({
    id: "balloon-tower",
    label: "Balloon tower",
    color: 0xff4f8d,
    look: "A tower of balloons with a silly face near the top.",
    rubberWheels: false,
    windUpKey: false,
    face: true,
  }),
});

const PHRASES = Object.freeze([
  ["Bandit gunfire destroyed the aircraft.", "A foam dart tumbled your toy. It gets back up."],
  ["Water contact destroyed the aircraft.", "Your toy went for a swim. It gets back up."],
  ["IMPACT PHYSICS RUNNING", "TUMBLE · BOUNCE · BACK UP"],
  ["FIRE GUNS ON SOLUTION", "THROW FOAM DARTS"],
  ["All raiders destroyed.", "Got you! Every toy."],
  ["FORTIFIED GUN PIT", "CARDBOARD FORT"],
  ["DESTROY GUN PIT", "SPLAT THE CARDBOARD FORT"],
  ["Kill the gun pit.", "Splat the cardboard fort."],
  ["kill the gun pit.", "Splat the cardboard fort."],
  ["SHORT-RANGE MISSILE", "PAPER PLANE"],
  ["SPLASH CONFIRMED", "Splat!"],
  ["DShK AA SITE", "BALLOON TOWER"],
  ["INFANTRY SQUAD", "GREEN ARMY MEN"],
  ["FIRE MISSILE", "THROW A WATER BALLOON"],
  ["GUN POSITION", "CARDBOARD FORT"],
  ["Bandit destroyed.", "Got you!"],
  ["Aircraft lost.", "Your toy tumbled. It gets back up."],
  ["Ownship lost.", "Your toy tumbled."],
  ["SUPPLY TRUCK", "TOY BLOCKS"],
  ["Friendly kills", "Friendly splats"],
  ["smoke column", "paint puff"],
  ["SPLASH TARGET", "Splat!"],
  ["Aircraft Lost", "Toy tumbled"],
  ["Ownship Lost", "Toy tumbled"],
  ["shot down", "tumbled"],
  ["GUNS ONLY", "FOAM DARTS"],
  ["GUNS SELECTED", "FOAM DARTS"],
  ["Guns Only", "Toys Only"],
  ["FIRE GUNS", "THROW FOAM DARTS"],
  ["GUNS HOT", "DARTS READY"],
  ["GUNS SAFE", "DARTS TUCKED"],
  ["FOX TWO", "Pop!"],
  ["GUN PIT", "CARDBOARD FORT"],
  ["HEATERS", "BALLOONS"],
  ["FOX 2", "Pop!"],
  ["SPLASH", "Splat!"],
  ["KILLS", "SPLATS"],
  ["GUNS", "DARTS"],
]);

const WORDS = Object.freeze([
  ["gunfire", "foam darts"],
  ["gunner", "thrower"],
  ["missiles", "water balloons"],
  ["missile", "water balloon"],
  ["bandits", "toys"],
  ["bandit", "toy"],
  ["raiders", "toys"],
  ["raider", "toy"],
  ["killed", "splatted"],
  ["kills", "splats"],
  ["kill", "splat"],
  ["destroyed", "splatted"],
  ["destroy", "splat"],
  ["deaths", "tumbles"],
  ["death", "tumble"],
  ["dying", "tumbling"],
  ["died", "tumbled"],
  ["dead", "tumbled"],
  ["explosions", "splats"],
  ["explosion", "splat"],
  ["exploded", "splatted"],
  ["explodes", "splats"],
  ["explode", "splat"],
  ["debris", "bits"],
  ["gore", "paint"],
  ["blood", "paint"],
  ["bombs", "paint blobs"],
  ["bomb", "paint blob"],
  ["guns", "darts"],
  ["gun", "dart"],
  ["smokes", "puffs"],
  ["smoke", "puff"],
  ["fires", "throws"],
  ["fire", "throw"],
  ["bonk", "Bonk!"],
]);

const FIXED_WORDS = new Set(["bonk"]);

const PHRASE_TABLE = Object.freeze(
  [...PHRASES].sort((a, b) => b[0].length - a[0].length),
);

const WORD_TABLE = new Map(WORDS.map(([from, to]) => [from, to]));

const WORD_PATTERN = new RegExp(
  `\\b(${WORDS.map(([word]) => word).sort((a, b) => b.length - a.length).join("|")})\\b`,
  "gi",
);

function matchCase(sample, replacement) {
  if (sample === sample.toUpperCase()) return replacement.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.toLowerCase();
}

export const TEXT_CHANGES = Object.freeze([
  ...PHRASES.map(([from, to]) => Object.freeze({ kind: "text", from, to })),
  ...WORDS.map(([from, to]) => Object.freeze({ kind: "text", from, to })),
]);

export function toyModeEnabled(settings) {
  return settings?.toyMode !== false;
}

export function presentText(value, toyMode = true) {
  if (typeof value !== "string") return value;
  if (toyMode === false || value.length === 0) return value;
  let text = value;
  for (const [from, to] of PHRASE_TABLE) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  return text.replace(WORD_PATTERN, (word) => {
    const replacement = WORD_TABLE.get(word.toLowerCase());
    if (!replacement) return word;
    if (FIXED_WORDS.has(word.toLowerCase())) return replacement;
    return matchCase(word, replacement);
  });
}

export function presentCaption(caption, toyMode = true) {
  if (!caption || toyMode === false) return caption;
  return {
    ...caption,
    line: presentText(caption.line, true),
    detail: presentText(caption.detail, true),
  };
}

function mapLabel(value, toyMode) {
  return typeof value === "string" ? presentText(value, toyMode) : value;
}

export function presentHudModel(model, toyMode = true) {
  if (!model || toyMode === false) return model;
  const mission = model.mission ? {
    ...model.mission,
    task: model.mission.task ? {
      ...model.mission.task,
      name: mapLabel(model.mission.task.name, true),
    } : model.mission.task,
  } : model.mission;
  const designation = model.designation ? {
    ...model.designation,
    label: mapLabel(model.designation.label, true),
  } : model.designation;
  const gunner = model.gunner ? {
    ...model.gunner,
    line: mapLabel(model.gunner.line, true),
    detail: mapLabel(model.gunner.detail, true),
  } : model.gunner;
  const formation = model.formation?.radio ? {
    ...model.formation,
    radio: {
      ...model.formation.radio,
      speaker: mapLabel(model.formation.radio.speaker, true),
      text: mapLabel(model.formation.radio.text, true),
    },
  } : model.formation;
  const tactical = model.tactical ? {
    ...model.tactical,
    objective: model.tactical.objective ? {
      ...model.tactical.objective,
      label: mapLabel(model.tactical.objective.label, true),
    } : model.tactical.objective,
    target: model.tactical.target ? {
      ...model.tactical.target,
      label: mapLabel(model.tactical.target.label, true),
    } : model.tactical.target,
    threats: Array.isArray(model.tactical.threats)
      ? model.tactical.threats.map((threat) => ({
        ...threat,
        label: mapLabel(threat.label, true),
      }))
      : model.tactical.threats,
  } : model.tactical;
  const warnings = Array.isArray(model.warnings)
    ? model.warnings.map((warning) => ({
      ...warning,
      text: mapLabel(warning.text, true),
    }))
    : model.warnings;
  return { ...model, mission, designation, gunner, formation, tactical, warnings };
}

export function badGuyForId(id) {
  const text = String(id ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return BAD_GUYS[(hash >>> 0) % BAD_GUYS.length];
}

export function groundTargetDress(role, faction, id) {
  const token = String(role ?? "").toLowerCase();
  if (token === "infantry" && faction === "friendly") {
    const guy = GOOD_GUYS[0];
    return {
      id: guy.id,
      label: guy.name,
      look: guy.look,
      behaviour: guy.behaviour,
      beat: guy.beat,
      color: guy.color,
      face: true,
      windUpKey: false,
      rubberWheels: false,
    };
  }
  if (token === "infantry") {
    const guy = badGuyForId(id);
    return {
      ...guy,
      label: guy.id,
      face: true,
      windUpKey: guy.id === "wind-up-robot",
      rubberWheels: guy.id === "rc-car-gang",
    };
  }
  if (token === "soft-vehicle") return { ...GROUND_TARGETS.blocks };
  if (token === "hard-point") return { ...GROUND_TARGETS.fort };
  if (token === "dshk-site") return { ...GROUND_TARGETS.balloonTower };
  return { ...GROUND_TARGETS.blocks };
}

export function downedToyPose(elapsedSeconds) {
  const t = Math.max(0, Number(elapsedSeconds) || 0);
  const scoreDelta = 0;
  if (t >= TOY_REJOIN_S) {
    return {
      phase: "rejoined", roll: 0, pitch: 0, yaw: 0, y: 0, rejoined: true, scoreDelta,
    };
  }
  if (t < 0.8) {
    const u = t / 0.8;
    return {
      phase: "tumble",
      roll: u * Math.PI * 2.5,
      pitch: u * 1.2,
      yaw: u * 0.8,
      y: 0,
      rejoined: false,
      scoreDelta,
    };
  }
  if (t < 1.8) {
    const u = (t - 0.8) / 1;
    return {
      phase: "bounce",
      roll: Math.PI * 2.5 * (1 - u),
      pitch: 1.2 * (1 - u),
      yaw: 0.4,
      y: Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 4,
      rejoined: false,
      scoreDelta,
    };
  }
  const u = (t - 1.8) / 1.2;
  return {
    phase: "upright",
    roll: (1 - u) * Math.PI,
    pitch: (1 - u) * 0.4,
    yaw: (1 - u) * Math.PI * 2,
    y: 0,
    rejoined: false,
    scoreDelta,
  };
}

function splatFrame(partial) {
  return {
    phase: "good-as-new",
    fallen: false,
    pose: "standing",
    siren: false,
    flash: false,
    wobble: false,
    reinforcements: false,
    stretcher: false,
    travel: 0,
    healed: false,
    ...partial,
  };
}

export function friendlySplatFrame(elapsedSeconds) {
  const t = Math.max(0, Number(elapsedSeconds) || 0);
  if (t < 0.35) {
    return splatFrame({
      phase: "fall-stiff",
      fallen: true,
      pose: "plastic-flat",
      reinforcements: true,
    });
  }
  if (t < 1.15) {
    return splatFrame({
      phase: "ambulance-out",
      siren: true,
      flash: true,
      wobble: true,
      reinforcements: true,
      travel: (t - 0.35) / 0.8,
    });
  }
  if (t < 1.7) {
    return splatFrame({
      phase: "stretcher-load",
      siren: true,
      flash: true,
      stretcher: true,
      reinforcements: true,
      travel: 1,
    });
  }
  if (t < 2.7) {
    return splatFrame({
      phase: "trundle-home",
      siren: true,
      wobble: true,
      reinforcements: true,
      travel: 1 - (t - 1.7) / 1,
    });
  }
  if (t < TOY_REJOIN_S) {
    return splatFrame({
      phase: "hop-out",
      healed: true,
      reinforcements: true,
      travel: 0,
    });
  }
  return splatFrame({ phase: "good-as-new", healed: true, travel: 0 });
}

export function noteFriendlySplat(telemetry = {}) {
  const prior = Math.max(0, Math.trunc(Number(telemetry?.friendlySplats) || 0));
  return Object.freeze({
    friendlySplats: prior + 1,
    lastCaption: FRIENDLY_SPLAT_CAPTION,
    scoreDelta: 0,
    penalty: false,
  });
}

export const ASSET_MAP = Object.freeze({
  "event.vehicle.destroyed.v1": "event.toy.tumble.v1",
  "wreck.smoke": "toy.paint-puff",
  "wreck.fire": "toy.none",
  "tracer.gun": "toy.foam-dart",
  "tracer.missile": "toy.water-balloon",
  "ordnance.bomb": "toy.paint-blob",
  "airframe.bandit": "toy.aircraft.face",
  "ground.infantry": "toy.army-man",
  "ground.truck": "toy.blocks",
  "ground.hard-point": "toy.cardboard-fort",
  "ground.aa": "toy.balloon-tower",
});

export const AUDIO_CUES = Object.freeze({
  gun: Object.freeze({
    id: "foam-dart-thup",
    realisticId: "gun-report",
    toneHz: 210,
    durationS: 0.045,
    gain: 0.05,
    filterHz: 900,
    noise: 0.03,
    label: "thup",
  }),
  missile: Object.freeze({
    id: "paper-plane-whoosh",
    realisticId: "aim9-launch",
    toneHz: 520,
    durationS: 0.12,
    gain: 0.04,
    filterHz: 1400,
    noise: 0.02,
    label: "whoosh",
  }),
  balloon: Object.freeze({
    id: "water-balloon-pop",
    realisticId: "aim9-launch",
    toneHz: 180,
    durationS: 0.06,
    gain: 0.06,
    filterHz: 600,
    noise: 0.05,
    label: "pop",
  }),
  hit: Object.freeze({
    id: "paint-splat",
    realisticId: "hit-impact",
    toneHz: 140,
    durationS: 0.07,
    gain: 0.05,
    filterHz: 500,
    noise: 0.04,
    label: "splat",
  }),
  destroy: Object.freeze({
    id: "balloon-pop",
    realisticId: "destroy-boom",
    toneHz: 240,
    durationS: 0.08,
    gain: 0.06,
    filterHz: 700,
    noise: 0.05,
    label: "pop",
  }),
  bomb: Object.freeze({
    id: "paint-blob",
    realisticId: "bomb-explosion",
    toneHz: 120,
    durationS: 0.09,
    gain: 0.05,
    filterHz: 420,
    noise: 0.05,
    label: "splat",
  }),
  bonk: Object.freeze({
    id: "toy-bonk",
    realisticId: "hit-impact",
    toneHz: 160,
    durationS: 0.05,
    gain: 0.05,
    filterHz: 400,
    noise: 0.01,
    label: "bonk",
  }),
  siren: Object.freeze({
    id: "toy-ambulance-siren",
    realisticId: null,
    toneHz: 620,
    altHz: 780,
    durationS: 0.7,
    gain: 0.04,
    wobbleHz: 5,
    filterHz: 900,
    noise: 0,
    label: "siren",
  }),
});

export const TOY_GUN_BED = Object.freeze({
  roundsPerSecond: 6,
  reportRate: 6,
  bodyHz: 200,
  bodyLevel: 0.012,
  gasLevel: 0.008,
  mechanismLevel: 0.006,
  reportLevel: 0.045,
});

export function toyAsset(id, toyMode = true) {
  if (toyMode === false) return id;
  return Object.prototype.hasOwnProperty.call(ASSET_MAP, id) ? ASSET_MAP[id] : id;
}

export function toyAudioCue(id) {
  return AUDIO_CUES[id] ?? null;
}

export const AUDIO_CHANGES = Object.freeze(
  Object.entries(AUDIO_CUES).map(([kind, cue]) => Object.freeze({
    kind: "audio",
    from: cue.realisticId,
    to: cue.id,
    label: cue.label,
    cue: kind,
  })),
);

export const ASSET_CHANGES = Object.freeze(
  Object.entries(ASSET_MAP).map(([from, to]) => Object.freeze({
    kind: "asset",
    from,
    to,
  })),
);
